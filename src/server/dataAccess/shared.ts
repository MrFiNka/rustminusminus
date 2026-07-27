import { isValidObjectId } from "mongoose";
import { GuildModel, type GuildClass } from "../../models/Guild";
import { TeamModel, type TeamClass } from "../../models/Team";
import { registry } from "../../modules/ModuleRegistry";
import { isTeamMemberOrAdmin, requirePermission } from "../../permissions/web";
import type { PermissionId } from "../../permissions/definitions";

/**
 * Finds a team by id, scoped to the given guild so a teamId from another guild can't be used.
 *
 * Queried directly rather than via `guild.getTeams()`: this runs on every team-scoped API request
 * and on every /ws open, and loading every team in the guild to pick one out in JS made the cost
 * scale with guild size. Constraining `_id` to `guild.teams` preserves the scoping guarantee.
 */
export async function findGuildTeam(guild: GuildClass, teamId: string) {
    if (!isValidObjectId(teamId)) return null;
    // guild.teams is already loaded, so the scope check costs nothing and needs no query of its own.
    if (!guild.teams.some(id => id.toString() === teamId)) return null;
    return TeamModel.findById(teamId);
}

/** Team-scoped module ids currently enabled for `team` - what the web dashboard uses to decide
 *  which module-owned sections/panels to render, mirroring Discord command visibility. */
export function enabledTeamModuleIds(team: TeamClass): string[] {
    return registry.all()
        .filter(mod => mod.scope === "team" && team.isModuleEnabled(mod.id))
        .map(mod => mod.id);
}

export function fail(status: number, error: string) {
    return { ok: false as const, status, error };
}

export function ok<T>(data: T) {
    return { ok: true as const, data };
}

async function resolveGuildAndTeam(guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    return ok({ guild, team });
}

function requireModuleEnabledForTeam(moduleId: string, team: Awaited<ReturnType<typeof findGuildTeam>>) {
    if (!team || registry.isEnabledForTeam(moduleId, team)) return null;
    return fail(403, `${registry.get(moduleId)?.name ?? moduleId} is not enabled for this team`);
}

/**
 * Auth for a team-scoped module *action* that has a real Discord-side permission id (e.g.
 * renaming a device, setting the raid-alert radius) - permission-group-or-guild-admin
 * (`requirePermission`) plus the module being enabled for the team. Mirrors
 * `chatLinks.ts`'s `authAndGuild()`, generalized to team scope.
 */
export async function requireTeamModuleAccess(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    moduleId: string,
    permission: PermissionId,
) {
    // Resolve the team first so the permission check is team-scoped: a team-scoped grant on this team
    // (or a guild-wide grant) authorizes it, but a grant on a different team does not.
    const resolved = await resolveGuildAndTeam(guildId, teamId);
    if (!resolved.ok) return resolved;
    if (!(await requirePermission(cookieToken, guildId, permission, resolved.data.team._id))) {
        return fail(401, "Not authorized");
    }
    return requireModuleEnabledForTeam(moduleId, resolved.data.team) ?? resolved;
}

/**
 * Auth for a team-scoped module *read* action with no Discord-side permission gate of its own
 * (e.g. vending search, matching `/market`'s lack of a permission check) - guild-admin only,
 * plus the module being enabled for the team.
 */
export async function requireTeamModuleEnabled(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    moduleId: string,
) {
    const resolved = await resolveGuildAndTeam(guildId, teamId);
    if (!resolved.ok) return resolved;
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, resolved.data.team))) return fail(401, "Not authorized");
    return requireModuleEnabledForTeam(moduleId, resolved.data.team) ?? resolved;
}
