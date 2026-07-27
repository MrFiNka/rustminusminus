import { Document, model, Schema, Types } from "mongoose";
import { UserModel } from "./User";
import { ServerModel } from "./Server";
import { connectTeam, disconnectTeam, getActiveRustplus } from "../rustplus/connections";
import { GuildModel } from "./Guild";
import { registry } from "../modules/ModuleRegistry";
import { grantRole, revokeRole } from "../utils/discordRoles";

/** One live-updating Discord message tracked by `key` (e.g. a paired device's entity id), so it
 *  can be looked up and edited in place instead of reposted - see src/discord/trackedEmbed.ts. */
export interface TrackedMessage {
    id: string;
    key: string;
}

const ServerSchema = {
    serverId: { type: String, required: true },
    pairedItems: {
        smartSwitch: [{
            id: { type: String, required: true },
            name: { type: String }
        }],
        smartAlarm: [{
            id: { type: String, required: true },
            name: { type: String },
            lastTriggered: { type: Date }
        }],
        storageMonitor: [{
            id: { type: String, required: true },
            name: { type: String }
        }]
    }
};

const TeamSchema = new Schema({
    name: { type: String, required: true },
    discord: {
        category: {
            id: { type: String, required: true }
        },
        playerActivity: {
            id: { type: String, required: true }
        },
        teamChat: {
            id: { type: String, required: true }
        },
        information: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        servers: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        switches: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        alarms: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        storageMonitors: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        // Optional (unlike the other channels above): older teams predate this channel and are
        // lazily backfilled by ensureEventsChannel() on first use, so it must not be required=true
        // or saving a pre-existing team without one would fail schema validation.
        events: {
            id: { type: String },
            messages: [{
                id: { type: String, required: true },
                key: { type: String, required: true }
            }]
        },
        roleId: { type: String, required: true }
    },
    users: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    servers: [ServerSchema],
    activeServerId: { type: String },
    activeCredentialUserId: { type: Schema.Types.ObjectId },
    // In-game chat command prefix for this team's Rust+ connection (see EventDispatcher). Default "!".
    chatPrefix: { type: String, default: "!" },
    modules: [{
        moduleId: { type: String, required: true },
        enabled: { type: Boolean, required: true },
        settings: { type: Schema.Types.Mixed, default: {} }
    }]
}, { timestamps: true });

export class TeamClass extends Document<Types.ObjectId> {
    name!: string;
    discord!: {
        category: { id: string };
        playerActivity: { id: string };
        teamChat: { id: string };
        information: { id: string; messages: TrackedMessage[] };
        servers: { id: string; messages: TrackedMessage[] };
        switches: { id: string; messages: TrackedMessage[] };
        alarms: { id: string; messages: TrackedMessage[] };
        storageMonitors: { id: string; messages: TrackedMessage[] };
        events: { id?: string; messages: TrackedMessage[] };
        roleId: string;
    };
    users!: Types.ObjectId[];
    servers!: {
        serverId: string;
        pairedItems: {
            smartSwitch: { id: string; name?: string }[];
            smartAlarm: { id: string; name?: string; lastTriggered?: Date }[];
            storageMonitor: { id: string; name?: string }[];
        };
    }[];
    activeServerId?: string;
    activeCredentialUserId?: Types.ObjectId;
    chatPrefix?: string;
    modules!: { moduleId: string; enabled: boolean; settings: Record<string, unknown> }[];
    createdAt!: Date;
    updatedAt!: Date;

    async getUsers() {
        return await UserModel.find({
            _id: { $in: this.users }
        });
    }

    async getActiveCredentialUser() {
        if (!this.activeCredentialUserId) return null;
        return await UserModel.findById(this.activeCredentialUserId);
    }

    async getActiveServerCredential() {
        let user = await this.getActiveCredentialUser();
        if (!user) return null;
        return user.credentials.servers.find(e => e.serverId == this.activeServerId);
    }

    async getActiveServer() {
        return await ServerModel.findOne({ serverId: this.activeServerId });
    }

    getActiveRustPlus() {
        return getActiveRustplus(this._id);
    }

    getActiveServerPaired() {
        return this.servers.find(e => e.serverId == this.activeServerId)?.pairedItems;
    }

    /** In-game chat command prefix, falling back to "!" when unset or blank. */
    getChatPrefix(): string {
        return this.chatPrefix?.trim() || "!";
    }

    isModuleEnabled(moduleId: string): boolean {
        return this.modules?.find(m => m.moduleId === moduleId)?.enabled
            ?? registry.get(moduleId)?.defaultEnabled
            ?? false;
    }

    async changeActiveServer(serverId: string) {
        let user = await this.getActiveCredentialUser();
        if (!user) return null;
        let creds = user.credentials.servers.find(e => e.serverId == serverId);
        if (!creds) {
            return false;
        }
        disconnectTeam(this._id);
        this.activeServerId = serverId;
        await this.save();
        await this.connectRustPlus();
    }

    async changeActiveCredentialUser(userId: Types.ObjectId) {
        let user = await UserModel.findById(userId);
        if (!user) return null;
        if (this.activeServerId) {
            let creds = user.credentials.servers.find(e => e.serverId == this.activeServerId);
            if (!creds) {
                return false;
            }
        }
        this.activeCredentialUserId = userId;
        await this.save();
    }

    async connectRustPlus() {
        let user = await this.getActiveCredentialUser();
        if (!user) return console.log("connectRustPlus: no active credential user");
        let cred = await this.getActiveServerCredential();
        if (!cred) return console.log("connectRustPlus: no credential for the active server");
        let server = await this.getActiveServer();
        if (!server) return console.log("connectRustPlus: active server not found");
        await connectTeam(this, server.ip, server.port, user.credentials.steam_id, cred.playerToken);
    }
    async getGuild() {
        return await GuildModel.findOne({ teams: this._id });
    }

    async addMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const userDb = await UserModel.findOne({ userId: discordUserId });
        if (!userDb) return { ok: false, error: "This user hasn't linked their account" };
        if (this.users.some(id => id.equals(userDb._id))) return { ok: false, error: "This user is already in this team" };
        const discordGuild = (await this.getGuild())?.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Can't find the Discord server" };
        const result = await grantRole(discordGuild, this.discord.roleId, discordUserId, "Administrator", "This bot doesn't have Administrator permissions");
        if (!result.ok) return result;
        this.users.push(userDb._id);
        await this.save();
        return { ok: true };
    }

    async removeMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const userDb = await UserModel.findOne({ userId: discordUserId });
        if (!userDb) return { ok: false, error: "This user hasn't linked their account" };
        if (!this.users.some(id => id.equals(userDb._id))) return { ok: false, error: "This user is not in this team" };
        if (this.activeCredentialUserId?.equals(userDb._id)) {
            return { ok: false, error: "Change the active credential before removing this user from the team" };
        }
        const discordGuild = (await this.getGuild())?.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Can't find the Discord server" };
        const result = await revokeRole(discordGuild, this.discord.roleId, discordUserId);
        if (!result.ok) return result;
        this.users = this.users.filter(id => !id.equals(userDb._id));
        await this.save();
        return { ok: true };
    }
    /**
     * Looks up one of this team's provisioned text channels by its `discord` sub-key. Excludes
     * "category" (a CategoryChannel, never text-based - fetch it directly via
     * `guild.channels.cache.get(team.discord.category.id)` instead, as Guild.ts already does).
     */
    async getChannel(key: Exclude<keyof TeamClass["discord"], "roleId" | "category">) {
        const channelId = this.discord[key].id;
        if (!channelId) return null;
        let guild = (await this.getGuild())?.getDiscordGuild();
        let channel = guild?.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return null;
        return channel;
    }
    async getDiscordRole() {
        let guild = (await this.getGuild())?.getDiscordGuild();
        return guild?.roles.cache.get(this.discord.roleId);;
    }
}

TeamSchema.loadClass(TeamClass);

export const TeamModel = model<TeamClass>("Team", TeamSchema);