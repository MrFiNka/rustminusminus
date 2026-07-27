import type { LoaderFunctionArgs } from "react-router-dom";
import { getTeamsList } from "../dataAccess/teams";

export function createTeamsLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getTeamsList(cookieToken, params.guildId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
