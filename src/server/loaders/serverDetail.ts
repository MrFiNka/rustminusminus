import type { LoaderFunctionArgs } from "react-router-dom";
import { getServerDetail } from "../dataAccess/serverDetail";

export function createServerDetailLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getServerDetail(cookieToken, params.guildId!, params.teamId!, params.serverId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
