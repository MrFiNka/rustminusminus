import { registry } from "../../modules/ModuleRegistry";
import { canManageTeamModules } from "../../permissions/scopes";
import { ok, resolveTeamByScope } from "./shared";

/**
 * Listing a team's modules needs the same `modules.manage` right as toggling one: the Modules tab is
 * hidden without it (see TeamSubNav), so reaching the URL by hand has to answer the same way. Both
 * the loader here and the PATCH route go through this.
 */
export const resolveManageableModuleTeam = (cookieToken: string | undefined, guildId: string, teamId: string) =>
    resolveTeamByScope(cookieToken, guildId, teamId, canManageTeamModules);

export async function getTeamModulesData(cookieToken: string | undefined, guildId: string, teamId: string) {
    const resolved = await resolveManageableModuleTeam(cookieToken, guildId, teamId);
    if (!resolved.ok) return resolved;
    const team = resolved.data;

    const modules = registry.all()
        .filter(mod => mod.scope === "team")
        .map(mod => ({
            id: mod.id,
            name: mod.name,
            description: mod.description,
            scope: mod.scope,
            enabled: team.isModuleEnabled(mod.id),
        }));
    return ok({ teamId: team._id.toString(), teamName: team.name, modules });
}
