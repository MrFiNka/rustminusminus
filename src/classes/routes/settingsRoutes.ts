import Elysia from "elysia";
import { getTeamSettingsData, setTeamChatPrefix, setTeamModuleSettings } from "../../server/dataAccess/teamSettings";
import { sessionPlugin } from "./session";

export const settingsRoutes = new Elysia({ name: "settingsRoutes" })
    .use(sessionPlugin)
    .get("guilds/:guildId/teams/:teamId/settings", async ({ params, cookieToken, set }) => {
        const result = await getTeamSettingsData(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/teams/:teamId/settings", async ({ params, body, cookieToken, set }) => {
        const chatPrefix = (body as { chatPrefix?: string }).chatPrefix;
        if (typeof chatPrefix !== "string") { set.status = 400; return { error: "chatPrefix is required" }; }
        const result = await setTeamChatPrefix(cookieToken as string | undefined, params.guildId as string, params.teamId as string, chatPrefix);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    .patch("guilds/:guildId/teams/:teamId/modules/:moduleId/settings", async ({ params, body, cookieToken, set }) => {
        const settings = (body as { settings?: Record<string, unknown> }).settings;
        if (!settings || typeof settings !== "object") { set.status = 400; return { error: "settings object is required" }; }
        const result = await setTeamModuleSettings(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.moduleId as string,
            settings,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    });
