import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { isTeamMemberOrAdmin } from "../../permissions/web";
import { fail, ok } from "./shared";
import { findGuildTeam } from "./shared";

export async function getTeamModulesData(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return fail(401, "Not authorized");
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
