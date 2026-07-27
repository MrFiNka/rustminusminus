import { GuildModel } from "../../models/Guild";
import { getWebActor, isTeamMemberOrAdmin, requireGuildAdmin } from "../../permissions/web";
import { findGuildTeam, fail, ok } from "../../server/dataAccess/shared";

/** Requires guild-admin auth, then resolves the guild itself. Used by routes that don't need a team. */
export async function resolveAdminGuild(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) return fail(401, "Not authorized");
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    return ok(guild);
}

/**
 * Resolves the guild, one of its teams, and the session `Actor` - and authorizes NOTHING itself.
 *
 * For the member routes, where "may add directly" and "may invite" are two different bars over the
 * same team (see permissions/scopes.ts): each route applies its own check to the returned actor, so
 * neither has to re-do the lookup to get one.
 */
export async function resolveTeamForMemberAction(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    return ok({ guild, team, actor: await getWebActor(cookieToken, guildId) });
}

/**
 * Like `resolveGuildTeam` but authorizes on team membership (guild admin OR a linked member of the
 * team) rather than guild admin. For read/member routes a plain team member is allowed to reach.
 */
export async function resolveMemberTeam(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return fail(401, "Not authorized");
    return ok({ guild, team });
}
