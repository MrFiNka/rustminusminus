import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { requirePermission } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getModulesData(cookieToken: string | undefined, guildId: string) {
    if (!(await requirePermission(cookieToken, guildId, "modules.manage"))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const modules = registry.all()
        .filter(mod => mod.scope === "guild")
        .map(mod => ({
            id: mod.id,
            name: mod.name,
            description: mod.description,
            scope: mod.scope,
            enabled: guild.isModuleEnabled(mod.id),
        }));
    return ok({ modules });
}
