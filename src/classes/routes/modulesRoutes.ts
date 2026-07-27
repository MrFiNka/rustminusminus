import Elysia from "elysia";
import { registry } from "../../modules/ModuleRegistry";
import { requireBotOwner, requirePermission } from "../../permissions/web";
import { getModulesData } from "../../server/dataAccess/modules";
import { getGuildEnabledModules } from "../../server/dataAccess/guildLayout";
import { getGlobalModulesData } from "../../server/dataAccess/globalModules";
import { getTeamModulesData, resolveManageableModuleTeam } from "../../server/dataAccess/teamModules";
import { sessionPlugin } from "./session";

export const modulesRoutes = new Elysia({ name: "modulesRoutes" })
    .use(sessionPlugin)
    .get("modules", async ({ cookieToken, set }) => {
        const result = await getGlobalModulesData(cookieToken as string | undefined);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("modules/:moduleId", async ({ params, body, cookieToken, set }) => {
        if (!(await requireBotOwner(cookieToken as string | undefined))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const { enabled } = body as { enabled: boolean };
        await registry.setEnabled(params.moduleId, {}, enabled);
        return { ok: true };
    })
    .get("guilds/:guildId/enabled-modules", async ({ params, cookieToken, set }) => {
        const result = await getGuildEnabledModules(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .get("guilds/:guildId/modules", async ({ params, cookieToken, set }) => {
        const result = await getModulesData(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/modules/:moduleId", async ({ params, body, cookieToken, set }) => {
        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "modules.manage"))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const { enabled } = body as { enabled: boolean };
        await registry.setEnabled(params.moduleId, { guildId: params.guildId }, enabled);
        return { ok: true };
    })
    .get("guilds/:guildId/teams/:teamId/modules", async ({ params, cookieToken, set }) => {
        const result = await getTeamModulesData(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/teams/:teamId/modules/:moduleId", async ({ params, body, cookieToken, set }) => {
        const access = await resolveManageableModuleTeam(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!access.ok) {
            set.status = access.status;
            return { error: access.error };
        }
        const { enabled } = body as { enabled: boolean };
        await registry.setEnabled(params.moduleId, { guildId: params.guildId, teamId: params.teamId }, enabled);
        return { ok: true };
    });
