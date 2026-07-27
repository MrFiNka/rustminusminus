import { PermissionGroupModel } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { requireGuildAdmin } from "../../permissions/web";
import { PERMISSIONS } from "../../permissions/definitions";
import { fail, ok } from "./shared";

export async function getPermissionGroupDetail(cookieToken: string | undefined, guildId: string, groupId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const group = await PermissionGroupModel.findOne({ _id: groupId, guildId });
    if (!group) return fail(404, "Permission group not found");
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

export async function getPermissionDefinitions(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    return ok(PERMISSIONS);
}

export async function getAssignableMembers(cookieToken: string | undefined, guildId: string, groupId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const group = await PermissionGroupModel.findOne({ _id: groupId, guildId });
    if (!group) return fail(404, "Permission group not found");
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
