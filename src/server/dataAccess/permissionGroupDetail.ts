import { GuildModel } from "../../models/Guild";
import { grantablePermissions } from "../../permissions/definitions";
import { fail, ok, resolveManageablePermissionGroup } from "./shared";

export async function getPermissionGroupDetail(cookieToken: string | undefined, guildId: string, groupId: string) {
    const resolved = await resolveManageablePermissionGroup(cookieToken, guildId, groupId);
    if (!resolved.ok) return resolved;
    const group = resolved.data;
    let teamName: string | null = null;
    if (group.teamId) {
        const guild = await GuildModel.findOne({ guildId });
        const team = guild ? (await guild.getTeams()).find(t => t._id.equals(group.teamId!)) : null;
        teamName = team?.name ?? null;
    }
    return ok({
        id: group._id.toString(),
        name: group.name,
        permissions: group.permissions,
        teamId: group.teamId?.toString() ?? null,
        teamName,
        discordUsers: group.getMembers(),
    });
}

/** The permissions this specific group may carry - scoped to it, since a team group can't hold
 *  guild-level permissions (see `grantablePermissions`). */
export async function getPermissionDefinitions(cookieToken: string | undefined, guildId: string, groupId: string) {
    const resolved = await resolveManageablePermissionGroup(cookieToken, guildId, groupId);
    if (!resolved.ok) return resolved;
    return ok(grantablePermissions(!!resolved.data.teamId));
}

export async function getAssignableMembers(cookieToken: string | undefined, guildId: string, groupId: string) {
    const resolved = await resolveManageablePermissionGroup(cookieToken, guildId, groupId);
    if (!resolved.ok) return resolved;
    const group = resolved.data;
    const discordGuild = group.getDiscordGuild();
    if (!discordGuild) return fail(404, "Discord server not found");
    const candidates = [];
    for (const member of discordGuild.members.cache.values()) {
        if (member.user.bot) continue;
        if (group.members.includes(member.id)) continue;
        candidates.push({ userId: member.id, displayName: member.displayName });
    }
    return ok(candidates);
}
