import type { LoaderFunctionArgs } from "react-router-dom";
import { getTeamPermissionGroups } from "../dataAccess/teamPermissionGroups";

export function createTeamPermissionGroupsLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getTeamPermissionGroups(cookieToken, params.guildId!, params.teamId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
