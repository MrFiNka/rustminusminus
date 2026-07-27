import type { LoaderFunctionArgs } from "react-router-dom";
import { getModulesData } from "../dataAccess/modules";

export function createModulesLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getModulesData(cookieToken, params.guildId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
