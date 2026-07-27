import { PermissionGroupModel } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { getWebActor } from "../../permissions/web";
import { canManageGuildPermissionGroups } from "../../permissions/scopes";
import { fail, ok } from "./shared";

/**
 * Guild-wide permission groups only. Team groups deliberately don't appear here - they live on their
 * own team's Permissions tab, so this screen is exactly "the grants that apply everywhere" rather
 * than a mixed list where scope was just a column.
 */
export async function getPermissionGroupsList(cookieToken: string | undefined, guildId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const actor = await getWebActor(cookieToken, guildId);
    if (!(await canManageGuildPermissionGroups(guildId, actor))) return fail(401, "Not authorized");

    const groups = await PermissionGroupModel.find({ guildId, teamId: null });
    return ok({
        groups: groups.map(g => ({
            id: g._id.toString(),
            name: g.name,
            permissions: g.permissions,
            memberCount: g.members.length,
        })),
    });
}
