import Elysia from "elysia";
import { getChatLinksList, createChatLink, deleteChatLink, addTeamToLink, removeTeamFromLink } from "../../server/dataAccess/chatLinks";
import { sessionPlugin } from "./session";

export const chatLinksRoutes = new Elysia({ name: "chatLinksRoutes" })
    .use(sessionPlugin)
    .get("guilds/:guildId/chat-links", async ({ params, cookieToken, set }) => {
        const result = await getChatLinksList(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/chat-links", async ({ params, body, cookieToken, set }) => {
        const name = (body as { name?: string }).name?.trim();
        if (!name) { set.status = 400; return { error: "Group name is required" }; }
        const result = await createChatLink(cookieToken as string | undefined, params.guildId as string, name);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .delete("guilds/:guildId/chat-links/:linkId", async ({ params, cookieToken, set }) => {
        const result = await deleteChatLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    .post("guilds/:guildId/chat-links/:linkId/teams", async ({ params, body, cookieToken, set }) => {
        const teamId = (body as { teamId?: string }).teamId;
        if (!teamId) { set.status = 400; return { error: "teamId is required" }; }
        const result = await addTeamToLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string, teamId);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    .delete("guilds/:guildId/chat-links/:linkId/teams/:teamId", async ({ params, cookieToken, set }) => {
        const result = await removeTeamFromLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    });
