import { TeamModel, type TeamClass } from "../models/Team";
import type { GuildClass } from "../models/Guild";
import { PermissionGroupModel, type PermissionGroupClass } from "../models/PermissionGroup";
import { resolveUserPermissions } from "./check";
import type { PermissionId } from "./definitions";

/**
 * Who is asking, resolved once by whichever surface is asking (a web session cookie in
 * permissions/web.ts, a Discord interaction in permissions/discord.ts). Keeping the rules here
 * rather than in each surface is what stops the web dashboard and `/permissions` from drifting
 * apart on who may edit what.
 */
export interface Actor {
    /** Discord user id, or null when the request carries no identifiable user. */
    discordUserId: string | null;
    /** Holds Discord's MANAGE_GUILD on the guild in question. */
    isGuildAdmin: boolean;
}

/** True if this is the bot owner (matched by the OWNER_DISCORD_ID env var). */
export function isBotOwner(discordUserId: string | null | undefined): boolean {
    const ownerId = Bun.env.OWNER_DISCORD_ID;
    return !!ownerId && !!discordUserId && discordUserId === ownerId;
}

/** Bypasses that apply to every permission-group scope: bot owner and guild admin. */
function isGuildLevelOverride(actor: Actor): boolean {
    return actor.isGuildAdmin || isBotOwner(actor.discordUserId);
}

/**
 * May the actor manage **guild-wide** permission groups (teamId == null)? Guild admin, bot owner, or
 * an explicit guild-wide `permissions.manage` grant. Team-scoped grants deliberately don't count -
 * a guild-wide group applies to every team, so it can't be editable from inside one team.
 */
export async function canManageGuildPermissionGroups(guildId: string, actor: Actor): Promise<boolean> {
    if (isGuildLevelOverride(actor)) return true;
    if (!actor.discordUserId) return false;
    // No teamId argument: only guild-wide grants are considered (see resolveUserPermissions).
    const granted = await resolveUserPermissions(guildId, actor.discordUserId);
    return granted.has("permissions.manage");
}

/** The reach of a set of already-fetched groups that hold some grant: guild-wide, plus team ids. */
function grantsFrom(groups: PermissionGroupClass[]) {
    return {
        /** A guild-wide group holding the grant reaches every team. */
        guildWide: groups.some(g => !g.teamId),
        teamIds: new Set(groups.filter(g => g.teamId).map(g => g.teamId!.toString())),
    };
}

/**
 * Where this user's `permission` grants apply, fetched in one query so the "which of these teams may
 * I manage?" case doesn't turn into a lookup per team.
 */
async function teamScopedGrants(guildId: string, discordUserId: string, permission: PermissionId) {
    return grantsFrom(await PermissionGroupModel.find({
        guildId,
        members: discordUserId,
        permissions: permission,
    }));
}

function grantsReachTeam(grants: ReturnType<typeof grantsFrom>, team: TeamClass): boolean {
    return grants.guildWide || grants.teamIds.has(team._id.toString());
}

/**
 * The shared shape of every "may I manage this one team?" rule: guild admin, bot owner, the team's
 * owner, or a grant of `permission` that reaches this team (guild-wide or scoped to it). Each caller
 * below only picks the permission id.
 */
async function canManageTeamWith(
    guildId: string,
    actor: Actor,
    team: TeamClass,
    permission: PermissionId,
): Promise<boolean> {
    if (isGuildLevelOverride(actor)) return true;
    if (!actor.discordUserId) return false;
    if (team.isOwnedBy(actor.discordUserId)) return true;
    return grantsReachTeam(await teamScopedGrants(guildId, actor.discordUserId, permission), team);
}

/** The list form of `canManageTeamWith`, resolved for every team in one query. */
async function manageableTeamsWith(
    guildId: string,
    actor: Actor,
    teams: TeamClass[],
    permission: PermissionId,
): Promise<TeamClass[]> {
    if (isGuildLevelOverride(actor)) return teams;
    if (!actor.discordUserId) return [];
    const grants = await teamScopedGrants(guildId, actor.discordUserId, permission);
    return teams.filter(t => t.isOwnedBy(actor.discordUserId) || grantsReachTeam(grants, t));
}

/**
 * May the actor manage permission groups scoped to `team`? Guild admin, bot owner, the team's owner,
 * or a `teampermissions.manage` grant that reaches this team (guild-wide or scoped to it).
 */
export async function canManageTeamPermissionGroups(guildId: string, actor: Actor, team: TeamClass): Promise<boolean> {
    return canManageTeamWith(guildId, actor, team, "teampermissions.manage");
}

/**
 * May the actor change `team`'s settings - its chat prefix and its modules' settings? Same rule,
 * keyed on `settings.manage`. Plain team membership is deliberately not enough: a module setting
 * changes the bot's behaviour for everyone on the team.
 */
export async function canManageTeamSettings(guildId: string, actor: Actor, team: TeamClass): Promise<boolean> {
    return canManageTeamWith(guildId, actor, team, "settings.manage");
}

/**
 * May the actor enable/disable modules on `team`? Same rule, keyed on `modules.manage` - the same
 * permission as the guild-wide Modules screen, which is why it is `teamScoped`. A guild-wide grant
 * therefore covers every team, while a team-scoped one only toggles modules on its own team (the
 * guild-level route resolves without a teamId, so it can never reach that far).
 */
export async function canManageTeamModules(guildId: string, actor: Actor, team: TeamClass): Promise<boolean> {
    return canManageTeamWith(guildId, actor, team, "modules.manage");
}

/**
 * The per-permission subsets of `teams` the actor may manage, for several permissions in ONE query.
 * The guild layout needs one such list per team sub-nav tab, and a round-trip per tab over the same
 * collection is what this avoids.
 */
export async function manageableTeamsByPermission<P extends PermissionId>(
    guildId: string,
    actor: Actor,
    teams: TeamClass[],
    permissions: P[],
): Promise<Record<P, TeamClass[]>> {
    const byPermission = {} as Record<P, TeamClass[]>;
    const fill = (pick: (permission: P) => TeamClass[]) => {
        for (const permission of permissions) byPermission[permission] = pick(permission);
        return byPermission;
    };

    if (isGuildLevelOverride(actor)) return fill(() => teams);
    const discordUserId = actor.discordUserId;
    if (!discordUserId) return fill(() => []);

    const groups = await PermissionGroupModel.find({
        guildId,
        members: discordUserId,
        permissions: { $in: permissions },
    });
    return fill(permission => {
        const grants = grantsFrom(groups.filter(g => g.permissions.includes(permission)));
        return teams.filter(t => t.isOwnedBy(discordUserId) || grantsReachTeam(grants, t));
    });
}

/** Dispatches to the guild-wide or team check based on the group's own scope. */
export async function canManagePermissionGroup(
    guildId: string,
    actor: Actor,
    group: PermissionGroupClass,
): Promise<boolean> {
    if (!group.teamId) return canManageGuildPermissionGroups(guildId, actor);
    const team = await TeamModel.findById(group.teamId);
    // A group pointing at a deleted team is only reachable by guild admins, so it can still be
    // cleaned up rather than being stranded with nobody able to touch it.
    if (!team) return isGuildLevelOverride(actor);
    return canManageTeamPermissionGroups(guildId, actor, team);
}

/** The subset of `teams` whose permission groups the actor may manage - same rule as
 *  `canManageTeamPermissionGroups`, resolved for the whole list in a single query. */
/**
 * May add a member to a team outright, with no invite for them to accept.
 *
 * Resolved WITHOUT a teamId on purpose: `resolveUserPermissions` then only considers guild-wide
 * groups, so a team-scoped grant can never reach this. Bypassing someone's consent is a guild-level
 * trust decision - a team lead delegating within their own team shouldn't be able to hand it out.
 */
export async function canAddTeamMembersDirectly(guildId: string, actor: Actor): Promise<boolean> {
    if (isGuildLevelOverride(actor)) return true;
    if (!actor.discordUserId) return false;
    const granted = await resolveUserPermissions(guildId, actor.discordUserId);
    return granted.has("teammembers.forceadd");
}

/**
 * May send someone an invite to this team. The team's owner, or a `teammembers.manage` grant
 * reaching this team (guild-wide or scoped to it). Anyone who can add directly can obviously also
 * invite, so that check comes first.
 */
export async function canInviteTeamMembers(guildId: string, actor: Actor, team: TeamClass): Promise<boolean> {
    if (await canAddTeamMembersDirectly(guildId, actor)) return true;
    if (!actor.discordUserId) return false;
    if (team.isOwnedBy(actor.discordUserId)) return true;
    const granted = await resolveUserPermissions(guildId, actor.discordUserId, team._id);
    return granted.has("teammembers.manage");
}

export async function manageablePermissionTeams(
    guildId: string,
    actor: Actor,
    teams: TeamClass[],
): Promise<TeamClass[]> {
    return manageableTeamsWith(guildId, actor, teams, "teampermissions.manage");
}

/**
 * What the actor may manage across the whole guild - the one lookup the list/detail screens and the
 * `/permissions` command need before deciding whether to show anything at all. Loads the guild's
 * teams once and reuses them, since every caller needs the team names anyway.
 */
export async function resolvePermissionScopes(guild: GuildClass, actor: Actor) {
    const teams = await guild.getTeams();
    const [guildWide, manageableTeams] = await Promise.all([
        canManageGuildPermissionGroups(guild.guildId, actor),
        manageablePermissionTeams(guild.guildId, actor, teams),
    ]);
    const manageableTeamIds = new Set(manageableTeams.map(t => t._id.toString()));
    return {
        teams,
        /** May create/edit guild-wide groups. */
        guildWide,
        manageableTeams,
        /** Whether a specific group falls inside the actor's reach, without re-querying per group.
         *  Admins/bot owner short-circuit so a group left pointing at a deleted team still lists for
         *  them - matching canManagePermissionGroup, which lets them delete it. */
        canManage: (group: { teamId: { toString(): string } | null }) =>
            isGuildLevelOverride(actor)
            || (group.teamId ? manageableTeamIds.has(group.teamId.toString()) : guildWide),
        /** False when the actor may manage nothing here - the caller should 401 rather than show an
         *  empty screen that looks like the guild simply has no groups. */
        any: guildWide || manageableTeams.length > 0,
    };
}
