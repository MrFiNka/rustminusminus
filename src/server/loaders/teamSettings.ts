import type { LoaderFunctionArgs } from "react-router-dom";
import { getTeamSettingsData } from "../dataAccess/teamSettings";

export function createTeamSettingsLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getTeamSettingsData(cookieToken, params.guildId!, params.teamId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
