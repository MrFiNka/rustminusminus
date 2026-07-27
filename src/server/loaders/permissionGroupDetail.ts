import type { LoaderFunctionArgs } from "react-router-dom";
import { getPermissionGroupDetail, getPermissionDefinitions, getAssignableMembers } from "../dataAccess/permissionGroupDetail";

export function createPermissionGroupDetailLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const [groupResult, definitionsResult, assignableResult] = await Promise.all([
            getPermissionGroupDetail(cookieToken, params.guildId!, params.groupId!),
            getPermissionDefinitions(cookieToken, params.guildId!),
            getAssignableMembers(cookieToken, params.guildId!, params.groupId!),
        ]);
        if (!groupResult.ok) throw new Response(groupResult.error, { status: groupResult.status });
        return {
            group: groupResult.data,
            definitions: definitionsResult.ok ? definitionsResult.data : [],
            assignableMembers: assignableResult.ok ? assignableResult.data : [],
        };
    };
}
