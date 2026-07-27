import { getGlobalModulesData } from "../dataAccess/globalModules";

export function createGlobalModulesLoader(cookieToken: string | undefined) {
    return async () => {
        const result = await getGlobalModulesData(cookieToken);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
