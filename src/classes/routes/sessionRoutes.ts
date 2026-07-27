import Elysia from "elysia";
import { getSessionData } from "../../server/dataAccess/session";
import { sessionPlugin } from "./session";

export const sessionRoutes = new Elysia({ name: "sessionRoutes" })
    .use(sessionPlugin)
    .get("session", async ({ cookieToken }) => {
        const result = await getSessionData(cookieToken as string | undefined);
        return result.data;
    });
