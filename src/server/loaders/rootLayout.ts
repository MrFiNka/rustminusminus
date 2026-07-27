import { getSessionData } from "../dataAccess/session";

export function createRootLayoutLoader(cookieToken: string | undefined) {
    return async () => (await getSessionData(cookieToken)).data;
}
