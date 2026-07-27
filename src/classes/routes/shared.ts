import { GuildModel } from "../../models/Guild";
import { isTeamMemberOrAdmin, requireGuildAdmin } from "../../permissions/web";
import { findGuildTeam, fail, ok } from "../../server/dataAccess/shared";

/** Requires guild-admin auth, then resolves the guild itself. Used by routes that don't need a team. */
export async function resolveAdminGuild(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) return fail(401, "Not authorized");
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    return ok(guild);
}

/**
 * Requires guild-admin auth, then resolves the guild and one of its teams by id. This is the
 * "requireGuildAdmin -> GuildModel.findOne -> findGuildTeam" sequence that used to be copy-pasted
 * into every team-scoped mutation route.
 */
export async function resolveGuildTeam(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guildResult = await resolveAdminGuild(cookieToken, guildId);
    if (!guildResult.ok) return guildResult;
    const team = await findGuildTeam(guildResult.data, teamId);
    if (!team) return fail(404, "Team not found");
    return ok({ guild: guildResult.data, team });
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
