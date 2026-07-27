import { getBotSettings } from "../../models/BotSettings";
import { registry } from "../../modules/ModuleRegistry";
import { requireBotOwner } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getGlobalModulesData(cookieToken: string | undefined) {
    if (!(await requireBotOwner(cookieToken))) {
        return fail(401, "Not authorized");
    }
    const settings = await getBotSettings();
    const modules = registry.all()
        .filter(mod => mod.scope === "global")
        .map(mod => ({
            id: mod.id,
            name: mod.name,
            description: mod.description,
            scope: mod.scope,
            enabled: settings.isModuleEnabled(mod.id) ?? mod.defaultEnabled,
        }));
    return ok({ modules });
}
