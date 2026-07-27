import type { Types } from "mongoose";
import { PermissionGroupModel } from "../models/PermissionGroup";
import { UserModel } from "../models/User";
import type { PermissionId } from "./definitions";

/**
 * Union of every permission a Discord user holds in this guild, honouring team scope:
 * - `teamId` omitted  -> only guild-wide groups (teamId == null) count. Use for guild-level actions.
 * - `teamId` provided -> guild-wide groups PLUS groups scoped to that exact team count, so a
 *   guild-wide grant still applies everywhere while a team grant only applies to its own team.
 */
export async function resolveUserPermissions(
    guildId: string,
    discordUserId: string,
    teamId?: Types.ObjectId | string,
): Promise<Set<PermissionId>> {
    const scope: Record<string, unknown> = { guildId, members: discordUserId };
    scope.teamId = teamId != null ? { $in: [null, teamId] } : null;
    const groups = await PermissionGroupModel.find(scope);
    return new Set(groups.flatMap(g => g.permissions) as PermissionId[]);
}

/**
 * Whether the in-game player who sent a chat command holds `permission` for this team. Maps the
 * sender's Rust/Steam id to their linked bot account, then checks their team-scoped grants. There is
 * no Manage-Server bypass in-game - a chat line carries no Discord admin context - so only explicit
 * grants (guild-wide or this team) allow. Denies unlinked players.
 */
export async function hasInGamePermission(
    guildId: string,
    teamId: Types.ObjectId | string,
    steamId: string,
    permission: PermissionId,
): Promise<boolean> {
    const user = await UserModel.findOne({ "credentials.steam_id": steamId });
    if (!user?.userId) return false;
    const granted = await resolveUserPermissions(guildId, user.userId, teamId);
    return granted.has(permission);
}
