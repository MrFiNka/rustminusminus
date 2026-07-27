import type { Types } from "mongoose";
import { PermissionFlagsBits } from "discord.js";
import { OauthModel } from "../models/OAuth";
import { GuildModel } from "../models/Guild";
import { TeamModel, type TeamClass } from "../models/Team";
import { UserModel } from "../models/User";
import { PermissionGroupModel } from "../models/PermissionGroup";
import { resolveUserPermissions } from "./check";
import type { PermissionId } from "./definitions";

/** True if the logged-in user is the bot owner (matched by OWNER_DISCORD_ID env var). */
export async function requireBotOwner(cookieToken: string | undefined): Promise<boolean> {
    const ownerId = Bun.env.OWNER_DISCORD_ID;
    if (!ownerId || !cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return false;
    return auth.userId.toString() === ownerId;
}

/** True if the logged-in user (by cookie) has Discord's MANAGE_GUILD permission on guildId. */
export async function requireGuildAdmin(cookieToken: string | undefined, guildId: string): Promise<boolean> {
    if (!cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth) return false;
    const guilds = await auth.getGuilds();
    if (!guilds) return false;
    const guild = guilds.find(g => g.id === guildId);
    if (!guild?.permissions) return false;
    return (BigInt(guild.permissions) & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild);
}

/**
 * True if the logged-in user (by cookie) is a guild admin, or holds `permission` via a permission
 * group. Pass `teamId` for a team-scoped action: a guild-wide grant OR a grant scoped to that team
 * then satisfies it. Omit it for guild-level actions (only guild-wide grants count).
 */
export async function requirePermission(
    cookieToken: string | undefined,
    guildId: string,
    permission: PermissionId,
    teamId?: Types.ObjectId | string,
): Promise<boolean> {
    if (await requireGuildAdmin(cookieToken, guildId)) return true;
    if (!cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return false;
    const granted = await resolveUserPermissions(guildId, auth.userId.toString(), teamId);
    return granted.has(permission);
}

/** The logged-in user's Discord id (from their session cookie), or null. */
export async function getSessionDiscordId(cookieToken: string | undefined): Promise<string | null> {
    if (!cookieToken) return null;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    return auth?.userId?.toString() ?? null;
}

/** True if the session user is a guild admin, or a linked member of this specific team. */
export async function isTeamMemberOrAdmin(cookieToken: string | undefined, guildId: string, team: TeamClass): Promise<boolean> {
    if (await requireGuildAdmin(cookieToken, guildId)) return true;
    const discordId = await getSessionDiscordId(cookieToken);
    if (!discordId) return false;
    const userDb = await UserModel.findOne({ userId: discordId });
    if (!userDb) return false;
    return team.users.some(id => id.equals(userDb._id));
}

/** True if the session user may enter the guild's dashboard subtree: guild admin, a member of any
 *  team in the guild, or a member of any permission group in the guild (guild-wide or team-scoped). */
export async function canViewGuild(cookieToken: string | undefined, guildId: string): Promise<boolean> {
    if (await requireGuildAdmin(cookieToken, guildId)) return true;
    const discordId = await getSessionDiscordId(cookieToken);
    if (!discordId) return false;

    const userDb = await UserModel.findOne({ userId: discordId });
    if (userDb) {
        const guild = await GuildModel.findOne({ guildId });
        if (guild && await TeamModel.exists({ _id: { $in: guild.teams }, users: userDb._id })) return true;
    }

    if (await PermissionGroupModel.exists({ guildId, members: discordId })) return true;
    return false;
}
