import { PermissionGroupModel } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { requireGuildAdmin } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getPermissionGroupsList(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    const teams = guild ? await guild.getTeams() : [];
    const teamNameById = new Map(teams.map(t => [t._id.toString(), t.name]));
    const groups = await PermissionGroupModel.find({ guildId });
    return ok({
        groups: groups.map(g => ({
            id: g._id.toString(),
            name: g.name,
            permissions: g.permissions,
            memberCount: g.members.length,
            teamId: g.teamId?.toString() ?? null,
            teamName: g.teamId ? (teamNameById.get(g.teamId.toString()) ?? null) : null,
        })),
        // Offered as scope options when creating a group.
        teams: teams.map(t => ({ id: t._id.toString(), name: t.name })),
    });
}
