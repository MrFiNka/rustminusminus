import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { canViewGuild, getWebActor, requireGuildAdmin } from "../../permissions/web";
import { resolvePermissionScopes } from "../../permissions/scopes";
import { fail, ok } from "./shared";

export async function getGuildEnabledModules(cookieToken: string | undefined, guildId: string) {
    if (!(await canViewGuild(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const enabledModules = registry.all()
        .filter(mod => guild.isModuleEnabled(mod.id))
        .map(mod => mod.id);
    // Resolved here, once per guild page load, because both sub-navs need it: the guild-level
    // Permissions tab keys off the guild-wide right, and each team's Permissions tab keys off
    // whether that team is in the manageable list. Doing it per-page would mean threading the same
    // flag through every team loader.
    const scopes = await resolvePermissionScopes(guild, await getWebActor(cookieToken, guildId));
    return ok({
        enabledModules,
        isAdmin: await requireGuildAdmin(cookieToken, guildId),
        canManageGuildPermissions: scopes.guildWide,
        manageablePermissionTeamIds: scopes.manageableTeams.map(t => t._id.toString()),
    });
}
