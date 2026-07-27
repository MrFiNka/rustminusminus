import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { canViewGuild, getWebActor, requireGuildAdmin } from "../../permissions/web";
import { manageableTeamsByPermission, resolvePermissionScopes } from "../../permissions/scopes";
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
    const actor = await getWebActor(cookieToken, guildId);
    const scopes = await resolvePermissionScopes(guild, actor);
    // Same idea for the Settings and Modules tabs - one query for both, reusing the teams
    // `resolvePermissionScopes` already loaded.
    const byTab = await manageableTeamsByPermission(guildId, actor, scopes.teams, ["settings.manage", "modules.manage"]);
    return ok({
        enabledModules,
        isAdmin: await requireGuildAdmin(cookieToken, guildId),
        canManageGuildPermissions: scopes.guildWide,
        manageablePermissionTeamIds: scopes.manageableTeams.map(t => t._id.toString()),
        manageableSettingsTeamIds: byTab["settings.manage"].map(t => t._id.toString()),
        manageableModuleTeamIds: byTab["modules.manage"].map(t => t._id.toString()),
    });
}
