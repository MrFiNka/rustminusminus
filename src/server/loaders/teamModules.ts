import type { LoaderFunctionArgs } from "react-router-dom";
import { getTeamModulesData } from "../dataAccess/teamModules";

export function createTeamModulesLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getTeamModulesData(cookieToken, params.guildId!, params.teamId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
