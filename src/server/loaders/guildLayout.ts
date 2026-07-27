import type { LoaderFunctionArgs } from "react-router-dom";
import { getGuildEnabledModules } from "../dataAccess/guildLayout";

export function createGuildLayoutLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getGuildEnabledModules(cookieToken, params.guildId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
