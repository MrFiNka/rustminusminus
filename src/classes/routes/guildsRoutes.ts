import Elysia from "elysia";
import { getGuildsForUser } from "../../server/dataAccess/guilds";
import { sessionPlugin } from "./session";

export const guildsRoutes = new Elysia({ name: "guildsRoutes" })
    .use(sessionPlugin)
    .get("guilds", async ({ cookieToken, set }) => {
        const result = await getGuildsForUser(cookieToken as string | undefined);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    });
