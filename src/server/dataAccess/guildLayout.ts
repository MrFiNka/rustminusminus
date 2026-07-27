import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { canViewGuild, requireGuildAdmin } from "../../permissions/web";
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
    return ok({ enabledModules, isAdmin: await requireGuildAdmin(cookieToken, guildId) });
}
