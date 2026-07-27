import type { Guild, PermissionResolvable } from "discord.js";

export type RoleActionResult = { ok: true } | { ok: false; error: string };

/**
 * Grants `roleId` to `discordUserId` in `discordGuild`, provided the bot has `requiredPermission`
 * and its highest role outranks the member's - Discord refuses role changes that violate the
 * hierarchy, so this check surfaces that as a clear error up front instead of an API failure.
 */
export async function grantRole(
    discordGuild: Guild,
    roleId: string,
    discordUserId: string,
    requiredPermission: PermissionResolvable,
    noPermissionError: string,
): Promise<RoleActionResult> {
    const member = discordGuild.members.cache.get(discordUserId)
        ?? await discordGuild.members.fetch(discordUserId).catch(() => null);
    if (!member) return { ok: false, error: "Can't find that user in the server" };
    if (member.roles.cache.has(roleId)) return { ok: true };
    const botMember = discordGuild.members.me;
    if (!botMember) return { ok: false, error: "Can't find the bot in the server" };
    if (!botMember.permissions.has(requiredPermission)) return { ok: false, error: noPermissionError };
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        return { ok: false, error: "Make the bot role the highest on the server or manually assign the role" };
    }
    await member.roles.add(roleId);
    return { ok: true };
}

/** Revokes `roleId` from `discordUserId` in `discordGuild`, if they currently have it. */
export async function revokeRole(discordGuild: Guild, roleId: string, discordUserId: string): Promise<RoleActionResult> {
    const member = discordGuild.members.cache.get(discordUserId)
        ?? await discordGuild.members.fetch(discordUserId).catch(() => null);
    if (!member) return { ok: false, error: "Can't find that user in the server" };
    if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
    return { ok: true };
}
