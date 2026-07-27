import type { LoaderFunctionArgs } from "react-router-dom";
import { getGuildsForUser } from "../dataAccess/guilds";

export function createGuildsLoader(cookieToken: string | undefined) {
    return async (_args: LoaderFunctionArgs) => {
        const result = await getGuildsForUser(cookieToken);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
