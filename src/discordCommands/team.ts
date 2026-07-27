import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandType } from "../types/DiscordCommandType";
import { GuildModel } from "../models/Guild";
import { DiscordBot } from "../classes/DiscordBot";
import { safeEditReply } from "../discord/safeReply";
import { getDiscordActor, hasDiscordPermission } from "../permissions/discord";
import { isBotOwner } from "../permissions/scopes";

/** Subcommands that create or destroy Discord structure (channels, roles) or the team record
 *  itself. These are irreversible, so they're Manage-Server only - no permission-group bypass. */
const GUILD_STRUCTURAL_SUBCOMMANDS = new Set(["create", "delete", "reset"]);

export default {
    command: async (interaction) => {
        if (!interaction.guild) return;
        const subcommand = interaction.options.getSubcommand();

        // Every subcommand here is destructive or membership-changing, and until now none of them
        // checked anything - any guild member could run `/team delete` and wipe a team's channels,
        // role and DB record with no rollback. Structural subcommands require Manage Server outright;
        // adduser/removeuser are gated per-team further down, once the team has been resolved (so a
        // team-scoped permission grant can satisfy them - see hasDiscordPermission).
        if (GUILD_STRUCTURAL_SUBCOMMANDS.has(subcommand)
            && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await interaction.reply({ content: "You need Manage Server permission to manage teams.", flags: ["Ephemeral"] });
        }

        if (subcommand == "create") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            // The creator owns the team, which is what lets them manage its permission groups later
            // without Manage Server. Transferable with /team setowner.
            let result = await guild.createTeam(name, interaction.user.id);
            if (!result) {
                await interaction.editReply({ content: "An error while creating the team ! Check that the bot has administrator permission" });
            } else {
                await interaction.editReply({ content: "Team created ! You own it — you can manage its permission groups with /permissions." });
            }
        }
        if (subcommand == "setowner") {
            let name = interaction.options.getString("name", true);
            let user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let guildDb = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guildDb) return await interaction.editReply({ content: "Can't find your guild in database!" });
            let teamDb = await guildDb.findTeamByName(name);
            if (!teamDb) return await interaction.editReply({ content: "Can't find the team" });
            // Handing the team over is the owner's own call, or an admin's - but not a
            // `teammembers.manage` holder's, since ownership carries more than membership does.
            const actor = getDiscordActor(interaction);
            if (!actor.isGuildAdmin && !isBotOwner(actor.discordUserId) && !teamDb.isOwnedBy(actor.discordUserId)) {
                return await interaction.editReply({ content: "Only this team's owner or a server admin can transfer it." });
            }
            teamDb.ownerId = user.id;
            await teamDb.save();
            await interaction.editReply({ content: `${user.username} now owns "${teamDb.name}" and can manage its permission groups.` });
        }
        if (subcommand == "delete") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });
            let team = await guild.findTeamByName(name);
            if (!team) return await interaction.reply({ content: "Can't find the team", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let result = await guild.deleteTeam(name);
            // safeEditReply from here on: if this command was invoked inside the team's own category,
            // the channel holding our deferred reply was just deleted along with it.
            if (!result) {
                await safeEditReply(interaction, { content: "An error while deleting the team ! Check the name and that the bot has administrator permission" });
            } else {
                await safeEditReply(interaction, { content: "Team deleted !" });
            }
        }
        if (subcommand == "reset") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });
            let team = await guild.findTeamByName(name);
            if (!team) return await interaction.reply({ content: "Can't find the team", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let result = await guild.deleteTeamChannels(name);
            // safeEditReply from here on: if this command was invoked inside the team's own category,
            // the channel holding our deferred reply was just deleted along with it.
            if (!result) {
                return await safeEditReply(interaction, { content: "An error while deleting the team ! Check the name and that the bot has administrator permission" });
            }
            let result2 = await guild.setupTeamChannels(name);
            if (!result2) {
                await safeEditReply(interaction, { content: "An error while creating the team ! Check that the bot has administrator permission" });
            } else {
                let team = await guild.findTeamByName(name);
                if (!team) return await safeEditReply(interaction, { content: "Unexpected error: couldn't find the team after setupTeamChannels" });
                team.discord.category.id = result2.categoryChannelId;
                team.discord.alarms.id = result2.alarmsChannelId;
                team.discord.alarms.messages = [];
                team.discord.information.id = result2.informationChannelId;
                team.discord.information.messages = [];
                team.discord.playerActivity.id = result2.playerActivityChannelId;
                team.discord.servers.id = result2.serversChannelId;
                team.discord.servers.messages = [];
                team.discord.storageMonitors.id = result2.storageMonitorsChannelId;
                team.discord.storageMonitors.messages = [];
                team.discord.switches.id = result2.switchesChannelId;
                team.discord.switches.messages = [];
                team.discord.events.id = result2.eventsChannelId;
                team.discord.events.messages = [];
                team.discord.teamChat.id = result2.teamchatChannelId;
                await team.save();
                // The teamchat channel id changed - refresh the MessageCreate fast-path set, or the
                // relay would silently ignore the new channel until the next restart.
                await DiscordBot.Instance.refreshTeamChatChannels();
                // The old information channel was deleted along with its dashboard link, so repost
                // it into the new one - same as /team create does.
                await guild.postTeamWelcome(team, result2.informationChannelId);
                await safeEditReply(interaction, {
                    content: result2.roleRecreated
                        ? "Team channels reset! The team role was missing, so it was also recreated."
                        : "Team channels reset!"
                });
            }
        }
        if (subcommand == "adduser") {
            let name = interaction.options.getString("name", true);
            let user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let guildDb = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guildDb) return await interaction.editReply({ content: "Can't find your guild in database!" });
            let teamDb = await guildDb.findTeamByName(name);
            if (!teamDb) return await interaction.editReply({ content: "Can't find the team" });
            if (!(await hasDiscordPermission(interaction, "teammembers.manage", teamDb._id))) {
                return await interaction.editReply({ content: "You aren't authorized to change this team's members." });
            }
            let result = await teamDb.addMember(user.id);
            if (!result.ok) return await interaction.editReply({ content: result.error });
            await interaction.editReply({ content: "Done." });
        }
        if (subcommand == "removeuser") {
            let name = interaction.options.getString("name", true);
            let user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let guildDb = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guildDb) return await interaction.editReply({ content: "Can't find your guild in database!" });
            let teamDb = await guildDb.findTeamByName(name);
            if (!teamDb) return await interaction.editReply({ content: "Can't find the team" });
            if (!(await hasDiscordPermission(interaction, "teammembers.manage", teamDb._id))) {
                return await interaction.editReply({ content: "You aren't authorized to change this team's members." });
            }
            let result = await teamDb.removeMember(user.id);
            if (!result.ok) return await interaction.editReply({ content: result.error });
            await interaction.editReply({ content: "Done." });
        }
    },
    // Deliberately NOT setDefaultMemberPermissions(ManageGuild): that hides the whole command, and
    // Discord has no per-subcommand equivalent - it would make adduser/removeuser unreachable for
    // someone holding a `teammembers.manage` grant, which is exactly the delegation the permission
    // system exists for. The per-subcommand checks in `command` above are the gate.
    slashCommand: new SlashCommandBuilder()
        .addSubcommand(subcommand =>
            subcommand
                .setName("reset")
                .setDescription("Will reset the channels of the team if you messed up")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Will delete the team entirely (no rollback)")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Will create a team with the following name")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("setowner")
                .setDescription("Transfer ownership of a team (the owner manages its permission groups)")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption
                        .setName("user")
                        .setDescription("The team's new owner")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("adduser")
                .setDescription("Will add a user to team")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption
                        .setName("user")
                        .setDescription("User to add to team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("removeuser")
                .setDescription("Will remove a user to team")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption
                        .setName("user")
                        .setDescription("User to remove from team")
                        .setRequired(true)
                )
        )
} as CommandType