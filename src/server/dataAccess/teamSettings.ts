import { registry } from "../../modules/ModuleRegistry";
import { resolveModuleSettings, setModuleSettings } from "../../modules/moduleSettings";
import { canManageTeamSettings } from "../../permissions/scopes";
import { invalidateTeam } from "../../rustplus/connections";
import { fail, ok, resolveTeamByScope } from "./shared";

/** Team-scoped modules that expose at least one configurable setting - the ones the Settings page renders. */
function configurableModules() {
    return registry.all().filter((mod) => mod.scope === "team" && (mod.settingsSchema?.length ?? 0) > 0);
}

/**
 * Reading the settings needs the same `settings.manage` right as writing them, on purpose: the
 * Settings tab is hidden without it (see TeamSubNav), so a hand-typed URL has to get the same answer
 * rather than a read-only view of a page nobody was shown a link to.
 */
const resolveManageableTeam = (cookieToken: string | undefined, guildId: string, teamId: string) =>
    resolveTeamByScope(cookieToken, guildId, teamId, canManageTeamSettings);

export async function getTeamSettingsData(cookieToken: string | undefined, guildId: string, teamId: string) {
    const resolved = await resolveManageableTeam(cookieToken, guildId, teamId);
    if (!resolved.ok) return resolved;
    const team = resolved.data;

    const modules = configurableModules().map((mod) => ({
        id: mod.id,
        name: mod.name,
        description: mod.description,
        enabled: team.isModuleEnabled(mod.id),
        schema: mod.settingsSchema ?? [],
        values: resolveModuleSettings(team, mod),
    }));

    return ok({
        teamId: team._id.toString(),
        teamName: team.name,
        chatPrefix: team.getChatPrefix(),
        modules,
    });
}

export async function setTeamChatPrefix(cookieToken: string | undefined, guildId: string, teamId: string, chatPrefix: string) {
    const resolved = await resolveManageableTeam(cookieToken, guildId, teamId);
    if (!resolved.ok) return resolved;
    const team = resolved.data;

    const prefix = chatPrefix.trim();
    if (!prefix) return fail(400, "Prefix can't be empty");
    if (/\s/.test(prefix)) return fail(400, "Prefix can't contain whitespace");
    if (prefix.length > 3) return fail(400, "Prefix must be at most 3 characters");

    team.chatPrefix = prefix;
    await team.save();
    // The in-game command matcher reads the prefix off a cached team document each dispatch - drop
    // it so the new prefix is live immediately instead of only after a reconnect.
    invalidateTeam(team._id);
    return ok(null);
}

export async function setTeamModuleSettings(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    moduleId: string,
    values: Record<string, unknown>,
) {
    const resolved = await resolveManageableTeam(cookieToken, guildId, teamId);
    if (!resolved.ok) return resolved;
    const team = resolved.data;

    const module = registry.get(moduleId);
    if (!module || module.scope !== "team" || !(module.settingsSchema?.length)) {
        return fail(404, "No settings for this module");
    }

    const result = await setModuleSettings(team, module, values);
    if (!result.ok) return fail(400, result.error);
    return ok(null);
}
