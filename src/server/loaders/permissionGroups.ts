import type { LoaderFunctionArgs } from "react-router-dom";
import { getPermissionGroupsList } from "../dataAccess/permissionGroups";

export function createPermissionGroupsLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getPermissionGroupsList(cookieToken, params.guildId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
