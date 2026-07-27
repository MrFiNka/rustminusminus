import Elysia from "elysia";
import { sendTeamChatMessage } from "../../server/dataAccess/teamChat";
import { sessionPlugin } from "./session";

export const teamActionsRoutes = new Elysia({ name: "teamActionsRoutes" })
    .use(sessionPlugin)
    .post("guilds/:guildId/teams/:teamId/chat", async ({ params, body, cookieToken, set }) => {
        const message = (body as { message?: string }).message?.trim();
        if (!message) { set.status = 400; return { error: "Message is required" }; }
        const result = await sendTeamChatMessage(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            message,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    });
