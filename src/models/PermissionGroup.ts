import { Document, model, Schema, Types } from "mongoose";
import { DiscordBot } from "../classes/DiscordBot";

const PermissionGroupSchema = new Schema(
    {
        guildId: { type: String, required: true },
        name: { type: String, required: true },
        permissions: [{ type: String, required: true }],
        // Explicit member list of Discord user ids. Bot permissions no longer ride on Discord roles -
        // membership is managed here directly (web UI, /permissions command), so it's identical across
        // the web, Discord, and in-game surfaces without a role to keep in sync.
        members: [{ type: String, required: true }],
        // null = guild-wide (grants on every team); set = scoped to that one team only.
        teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    },
    { timestamps: true },
);

// A name is unique within a (guild, scope): a guild-wide "Raiders" and a per-team "Raiders" can
// coexist because their teamId differs.
PermissionGroupSchema.index({ guildId: 1, teamId: 1, name: 1 }, { unique: true });

export class PermissionGroupClass extends Document<Types.ObjectId> {
    guildId!: string;
    name!: string;
    permissions!: string[];
    members!: string[];
    teamId!: Types.ObjectId | null;
    createdAt!: Date;
    updatedAt!: Date;

    getDiscordGuild() {
        return DiscordBot.Instance.guilds.cache.get(this.guildId);
    }

    async addMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        if (this.members.includes(discordUserId)) return { ok: false, error: "This user is already in this group" };
        this.members.push(discordUserId);
        await this.save();
        return { ok: true };
    }

    async removeMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        if (!this.members.includes(discordUserId)) return { ok: false, error: "This user isn't in this group" };
        this.members = this.members.filter(id => id !== discordUserId);
        await this.save();
        return { ok: true };
    }

    /** Current members with best-effort display names resolved from the Discord guild member cache. */
    getMembers(): { userId: string; displayName: string }[] {
        const discordGuild = this.getDiscordGuild();
        return this.members.map(userId => ({
            userId,
            displayName: discordGuild?.members.cache.get(userId)?.displayName ?? userId,
        }));
    }
}

PermissionGroupSchema.loadClass(PermissionGroupClass);

export const PermissionGroupModel = model<PermissionGroupClass>("PermissionGroup", PermissionGroupSchema);

/** Creates a permission group. `teamId` null (default) makes it guild-wide; a team id scopes it to
 *  that team. No Discord role is created - membership lives in the `members` array. */
export async function createPermissionGroup(
    guildId: string,
    name: string,
    teamId: Types.ObjectId | string | null = null,
): Promise<PermissionGroupClass | null> {
    return await PermissionGroupModel.create({ guildId, name, permissions: [], members: [], teamId: teamId ?? null });
}
