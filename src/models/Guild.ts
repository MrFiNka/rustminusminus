import { Document, model, Schema, Types } from "mongoose";
import { TeamModel, type TeamClass } from "./Team";
import { DiscordBot } from "../classes/DiscordBot";
import { getRandomHexColor } from "../utils";
import { disconnectTeam } from "../rustplus/connections";
import { registry } from "../modules/ModuleRegistry";
import { ChannelType, PermissionFlagsBits, Role, type Guild } from "discord.js";
const GuildSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    teams: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    modules: [{
        moduleId: { type: String, required: true },
        enabled: { type: Boolean, required: true },
        settings: { type: Schema.Types.Mixed, default: {} }
    }]
}, { timestamps: true });

export class GuildClass extends Document<Types.ObjectId> {
    guildId!: string;
    teams!: Types.ObjectId[];
    modules!: { moduleId: string; enabled: boolean; settings: Record<string, unknown> }[];
    createdAt!: Date;
    updatedAt!: Date;

    isModuleEnabled(moduleId: string): boolean {
        return this.modules?.find(m => m.moduleId === moduleId)?.enabled
            ?? registry.get(moduleId)?.defaultEnabled
            ?? false;
    }

    async createTeam(name: string) {
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        let role = await guild.roles.create({
            name,
            colors: {
                primaryColor: getRandomHexColor() as `#${string}`
            }
        });
        if (!role) return false;
        let setup = await this.setupTeamChannels(name, role);
        if (!setup) {
            // We own this role - it was created two lines up purely for this team. Channel setup
            // rolled its own work back, so dropping the role too leaves the guild as we found it
            // rather than accumulating an orphan role on every failed /team create.
            await role.delete().catch(() => { /* best-effort rollback */ });
            return false;
        }
        let { categoryChannelId, roleId, alarmsChannelId, informationChannelId, playerActivityChannelId, serversChannelId, storageMonitorsChannelId, switchesChannelId, teamchatChannelId, eventsChannelId } = setup;
        let team = await TeamModel.create({
            name,
            discord: {
                category: {
                    id: categoryChannelId
                },
                alarms: {
                    id: alarmsChannelId,
                    messages: []
                },
                information: {
                    id: informationChannelId,
                    messages: []
                },
                playerActivity: {
                    id: playerActivityChannelId
                },
                servers: {
                    id: serversChannelId,
                    messages: []
                },
                storageMonitors: {
                    id: storageMonitorsChannelId,
                    messages: []
                },
                switches: {
                    id: switchesChannelId,
                    messages: []
                },
                events: {
                    id: eventsChannelId,
                    messages: []
                },
                teamChat: {
                    id: teamchatChannelId
                },
                roleId
            }
        });
        this.teams.push(team._id);
        await this.save();
        await DiscordBot.Instance.refreshTeamChatChannels();
        return true;
    }

    async setupTeamChannels(name: string, role?: Role) {
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        let roleRecreated = false;
        if (!role) {
            let team = await this.findTeamByName(name);
            if (!team) return false;
            // The role may not be cached, or may have been deleted out-of-band (the whole
            // point of a reset). Try a fetch first, then recreate + persist a new role.
            role = guild.roles.cache.get(team.discord.roleId)
                ?? (await guild.roles.fetch(team.discord.roleId).catch(() => null))
                ?? undefined;
            if (!role) {
                role = await guild.roles.create({
                    name,
                    colors: {
                        primaryColor: getRandomHexColor() as `#${string}`
                    }
                });
                team.discord.roleId = role.id;
                await team.save();
                roleRecreated = true;
            }
        }
        // Nine sequential Discord calls, any of which can fail (rate limit, lost permissions, channel
        // cap). Track what we created so a failure part-way can undo itself instead of leaving a
        // half-built category behind that the caller has no handle on and no way to clean up.
        const created: { delete(): Promise<unknown> }[] = [];
        const createChannel = async (options: Parameters<typeof guild.channels.create>[0]) => {
            const channel = await guild.channels.create(options);
            created.push(channel);
            return channel;
        };

        try {
            let categoryChannel = await createChannel({
                name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: [
                            PermissionFlagsBits.ViewChannel
                        ]
                    },
                    {
                        id: role!.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel
                        ]
                    }
                ]
            });
            let informationChannel = await createChannel({
                name: "information",
                parent: categoryChannel.id
            });
            let serversChannel = await createChannel({
                name: "servers",
                parent: categoryChannel.id
            });
            let teamchatChannel = await createChannel({
                name: "teamchat",
                parent: categoryChannel.id
            });
            let switchesChannel = await createChannel({
                name: "switches",
                parent: categoryChannel.id
            });
            let alarmsChannel = await createChannel({
                name: "alarms",
                parent: categoryChannel.id
            });
            let storageMonitorsChannel = await createChannel({
                name: "storageMonitors",
                parent: categoryChannel.id
            });
            let playerActivityChannel = await createChannel({
                name: "playerActivity",
                parent: categoryChannel.id
            });
            let eventsChannel = await createChannel({
                name: "events",
                parent: categoryChannel.id
            });
            return {
                roleRecreated,
                roleId: role!.id,
                categoryChannelId: categoryChannel.id,
                informationChannelId: informationChannel.id,
                serversChannelId: serversChannel.id,
                teamchatChannelId: teamchatChannel.id,
                switchesChannelId: switchesChannel.id,
                alarmsChannelId: alarmsChannel.id,
                storageMonitorsChannelId: storageMonitorsChannel.id,
                playerActivityChannelId: playerActivityChannel.id,
                eventsChannelId: eventsChannel.id
            };
        } catch (err) {
            console.error(`setupTeamChannels failed for "${name}", rolling back created channels:`, err);
            // Children first, then the category - deleting a category doesn't remove what's inside it.
            for (const channel of created.reverse()) {
                await channel.delete().catch(() => { /* best-effort rollback */ });
            }
            return false;
        }
    }

    /** Lazily backfills the `events` channel for teams created before it existed (its `id` is
     *  optional in the schema for exactly this reason). Safe to call unconditionally. */
    async ensureEventsChannel(team: TeamClass): Promise<string | null> {
        if (team.discord.events?.id) return team.discord.events.id;
        let guild = this.getDiscordGuild();
        if (!guild) return null;
        let eventsChannel = await guild.channels.create({
            name: "events",
            parent: team.discord.category.id
        });
        team.discord.events = { id: eventsChannel.id, messages: [] };
        await team.save();
        return eventsChannel.id;
    }

    /** Deletes a team's category and every channel parented under it, if the category still exists. */
    private async deleteTeamCategoryAndChannels(guild: Guild, team: TeamClass): Promise<boolean> {
        const category = guild.channels.cache.get(team.discord.category.id);
        if (!category) {
            return true; // already gone - nothing to delete, let the caller proceed to recreate
        }
        if (category.type !== ChannelType.GuildCategory) {
            return false; // stored id doesn't point at a category - real error
        }
        const channelsToDelete = guild.channels.cache.filter(
            ch => ch.parentId === team.discord.category.id
        );
        for (const channel of channelsToDelete.values()) {
            try {
                await channel.delete();
            } catch (err) {
                console.error(`Failed to delete ${channel.name}:${channel.id} :`, err);
            }
        }
        await category.delete();
        return true;
    }

    async deleteTeamChannels(name: string) {
        let team = await this.findTeamByName(name);
        if (!team) return false;
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        return this.deleteTeamCategoryAndChannels(guild, team);
    }
    async deleteTeam(name: string) {
        let team = await this.findTeamByName(name);
        if (!team) return false;
        disconnectTeam(team._id);
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        if (!await this.deleteTeamCategoryAndChannels(guild, team)) return false;
        // Best-effort: the role may already be gone (deleted out-of-band, or a previous partial
        // delete). Letting that throw used to abort the whole teardown and strand the team in the
        // DB with its channels already deleted - a state nothing can recover from.
        try {
            await guild.roles.delete(team.discord.roleId);
        } catch (err) {
            console.error(`Failed to delete role ${team.discord.roleId} for team ${name}:`, err);
        }
        this.teams = (await this.getTeams()).filter(e => e.name != name).map(e => e._id);
        await this.save();
        await TeamModel.deleteOne({ _id: team._id });
        await DiscordBot.Instance.refreshTeamChatChannels();
        return true;
    }

    getDiscordGuild() {
        let bot = DiscordBot.Instance;
        return bot.guilds.cache.get(this.guildId);
    }

    async getTeams() {
        return await TeamModel.find({
            _id: { $in: this.teams }
        });
    }

    /** One query scoped to this guild's teams, rather than loading them all to filter in JS. */
    async findTeamByName(name: string) {
        return await TeamModel.findOne({ _id: { $in: this.teams }, name });
    }
}

GuildSchema.loadClass(GuildClass);

export const GuildModel = model<GuildClass>("Guild", GuildSchema);