import { PermissionGroupModel } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { getWebActor } from "../../permissions/web";
import { canManageTeamPermissionGroups } from "../../permissions/scopes";
import { grantablePermissions } from "../../permissions/definitions";
import { fail, findGuildTeam, ok } from "./shared";

/**
 * The permission groups belonging to one team - what the team's own Permissions tab shows. Only ever
 * returns `teamId: team._id` groups; guild-wide groups are the guild Permissions screen's business,
 * which is the whole point of splitting the two surfaces.
 */
export async function getTeamPermissionGroups(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    const actor = await getWebActor(cookieToken, guildId);
    if (!(await canManageTeamPermissionGroups(guildId, actor, team))) return fail(401, "Not authorized");

    const groups = await PermissionGroupModel.find({ guildId, teamId: team._id });
    return ok({
        teamName: team.name,
        groups: groups.map(g => ({
            id: g._id.toString(),
            name: g.name,
            permissions: g.permissions,
            memberCount: g.members.length,
        })),
        // Shown as a hint on the empty/create form so it's clear what a team group can actually
        // carry, without a round trip per group.
        grantable: grantablePermissions(true).map(p => ({ id: p.id, label: p.label })),
    });
}
