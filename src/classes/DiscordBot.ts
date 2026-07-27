import { Client, Events, Guild, REST, Routes, type ClientOptions, type Message } from "discord.js";
import fs from "fs/promises";
import type { CommandType } from "../types/DiscordCommandType";
import { GuildModel } from "../models/Guild";
import { TeamModel } from "../models/Team";
import { UserModel } from "../models/User";
import { registry } from "../modules/ModuleRegistry";
import { getOrCreateUserRustplus, markRelayedToGame } from "../rustplus/connections";
import { CHAT_PAIRING_HELP } from "../utils";

export class DiscordBot extends Client {
    private CLIENT_ID: undefined | string;
    private coreCommands: CommandType[] = [];
    private guildCommandSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /**
     * Every team's `discord.teamChat` channel id. The MessageCreate handler below fires for every
     * message in every guild the bot is in, and used to open with a `TeamModel.findOne` on all of
     * them - a database round-trip per message just to discover the overwhelmingly common answer
     * "this isn't a teamchat channel". This set answers that in memory.
     *
     * Refreshed wholesale (see refreshTeamChatChannels) rather than surgically patched: it's one
     * cheap projection over a small collection, and rebuilding it removes any chance of the set
     * drifting from the DB after a create/delete/reset.
     */
    private teamChatChannelIds = new Set<string>();
    public static Instance: DiscordBot;
    constructor(props: ClientOptions) {
        super(props);
        DiscordBot.Instance = this;
    }
    init() {
        this.eventRegister();
        this.login(Bun.env.TOKEN);
    }
    eventRegister() {
        this.on(Events.ClientReady, async (client) => {
            this.CLIENT_ID = client.user.id;
            console.log("Connected to discord as " + client.user.tag);
            await this.clearGlobalCommands();
            await this.slashCommandRegister();
            await this.guildsInit();
        });
        this.on(Events.GuildCreate, async (guild) => {
            await this.guildInit(guild);
        });
        this.on(Events.GuildDelete, (guild) => {
            this.guildRemove(guild);
        });
        this.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const coreCommand = this.coreCommands.find(e => e.name == interaction.commandName);
            if (coreCommand) {
                await coreCommand.command(interaction);
                return;
            }

            if (!interaction.guildId) return;
            const owningModule = registry.moduleDiscordCommandOwners().get(interaction.commandName);
            if (!owningModule) return;
            // race-condition safety net: the command normally isn't even registered when disabled
            if (!registry.isEnabledForGuild(owningModule.id, interaction.guildId)) {
                await interaction.reply({ content: "This module is disabled for this server.", flags: ["Ephemeral"] });
                return;
            }
            const command = owningModule.discordCommands?.find(c => c.name === interaction.commandName);
            await command?.command(interaction);
        });
        // Discord -> game half of the chat-relay module (the game -> Discord half is that
        // module's onTeamMessage hook, dispatched like any other module through EventDispatcher).
        // This direction needs its own listener since only Discord's gateway, not the module
        // system, can tell us a human typed in one of a team's teamChat channels. The message is
        // sent in-game under the AUTHOR'S own linked Rust account (a per-user connection), so it
        // shows up as genuinely from them rather than the team's single shared account.
        this.on(Events.MessageCreate, async (message) => {
            if (message.author.bot || !message.guildId || !message.content) return;
            // In-memory gate before any DB work - this handler sees every message in every guild.
            if (!this.teamChatChannelIds.has(message.channelId)) return;
            const team = await TeamModel.findOne({ "discord.teamChat.id": message.channelId });
            if (!team || !registry.isEnabledForTeam("chat-relay", team)) return;

            // Only linked members who have paired the active server may use the bridge.
            const userDb = await UserModel.findOne({ userId: message.author.id });
            const authorized = !!userDb
                && team.users.some(id => id.equals(userDb._id))
                && userDb.credentials.servers.some(s => s.serverId === team.activeServerId);
            if (!authorized) {
                await this.rejectBridgeMessage(message, CHAT_PAIRING_HELP);
                return;
            }

            const conn = await getOrCreateUserRustplus(team, userDb!);
            if (!conn) {
                await this.rejectBridgeMessage(message, CHAT_PAIRING_HELP);
                return;
            }
            markRelayedToGame(team._id, userDb!.credentials.steam_id, message.content);
            await conn.sendTeamMessage(message.content);
        });
    }
    /** Flags a teamchat message that wasn't relayed to the game: a ❌ reaction plus a short reply
     *  that self-deletes so it doesn't clutter the channel. */
    private async rejectBridgeMessage(message: Message, reason: string) {
        try {
            await message.react("❌");
            const notice = await message.reply(reason);
            setTimeout(() => { notice.delete().catch(() => { }); }, 8000);
        } catch { /* missing perms / message gone - nothing to do */ }
    }
    async slashCommandRegister() {
        let folder = await fs.readdir("./src/discordCommands");
        for (const file of folder) {
            let command = (await import("../discordCommands/" + file)).default as CommandType;
            let name = file.split(".")[0];
            // `continue`, not `return`: a single oddly-named file must skip itself, not silently
            // abort loading every command after it in the directory listing.
            if (!name) continue;
            command.name = name;
            command.slashCommand.setName(name);
            if (!command.slashCommand.description) {
                command.slashCommand.setDescription("No description yet")
            }
            this.coreCommands.push(command);
            console.log("Discord command '" + command.name + "' loaded !")
        }
    }
    /** Throttles Discord command syncs per guild: bursts of calls within a 10s window
     *  (e.g. toggling several modules in a row) collapse into a single PUT at the end
     *  of that window instead of one REST call per toggle. */
    async registerGuildCommands(guildId: string) {
        if (this.guildCommandSyncTimers.has(guildId)) return;
        const timer = setTimeout(() => {
            this.guildCommandSyncTimers.delete(guildId);
            this.doRegisterGuildCommands(guildId);
        }, 10_000);
        this.guildCommandSyncTimers.set(guildId, timer);
    }
    /** PUTs the full enabled command set (core + enabled modules) for one guild - Discord applies
     *  guild-scoped command changes near-instantly, which is what makes toggling a module live. */
    private async doRegisterGuildCommands(guildId: string) {
        if (!this.CLIENT_ID) return;
        const rest = new REST({ version: '10' }).setToken(Bun.env.TOKEN);
        const enabledModuleCommandNames = registry.discordCommandNamesForGuild(guildId);
        const enabledModuleCommands = registry.allDiscordCommands().filter(c => enabledModuleCommandNames.has(c.name));
        const body = [...this.coreCommands, ...enabledModuleCommands].map(c => c.slashCommand.toJSON());
        try {
            await rest.put(Routes.applicationGuildCommands(this.CLIENT_ID, guildId), { body });
            console.log(`Successfully synced application (/) commands for guild ${guildId}.`);
        } catch (error) {
            console.error(error);
        }
    }
    /** Wipes any GLOBALLY-registered commands from earlier versions of this bot (which used
     *  Routes.applicationCommands). Commands are now guild-scoped only (registerGuildCommands),
     *  but Discord doesn't clear old global registrations on its own just because we stopped
     *  calling that endpoint - without this, old global commands stick around forever and show
     *  up duplicated alongside the new guild-scoped ones. Safe/idempotent to run on every start. */
    async clearGlobalCommands() {
        if (!this.CLIENT_ID) return;
        const rest = new REST({ version: '10' }).setToken(Bun.env.TOKEN);
        try {
            await rest.put(Routes.applicationCommands(this.CLIENT_ID), { body: [] });
        } catch (error) {
            console.error(error);
        }
    }
    /** Rebuilds the teamchat-channel id set used by the MessageCreate fast path. Call after any
     *  change to the set of teams or their channels (create / delete / reset). */
    async refreshTeamChatChannels() {
        const teams = await TeamModel.find({}, { "discord.teamChat.id": 1 });
        this.teamChatChannelIds = new Set(
            teams.map(t => t.discord?.teamChat?.id).filter((id): id is string => !!id)
        );
    }

    async guildsInit() {
        await this.refreshTeamChatChannels();
        let guilds = this.guilds.cache;
        for (const guild of guilds.values()) {
            await this.guildInit(guild)
        }
        let guildsToDelete = (await GuildModel.find()).map(e => e.guildId).filter(e => !guilds.has(e));
        for (const guild of guildsToDelete) {
            if (guild) {
                this.guildRemoveId(guild);
            }
        }
    }
    async guildInit(guild: Guild) {
        let data = await this.getGuildData(guild);
        if (!data) {
            data = await GuildModel.create({
                guildId: guild.id
            });
        }
        registry.primeGuild(data);
        await this.registerGuildCommands(guild.id);
    }
    async guildRemove(guild: Guild) {
        return this.guildRemoveId(guild.id);
    }
    async guildRemoveId(guild: string) {
        await GuildModel.deleteOne({ guildId: guild });
    }
    async getGuildData(guild: Guild) {
        return await GuildModel.findOne({ guildId: guild.id })
    }
}
