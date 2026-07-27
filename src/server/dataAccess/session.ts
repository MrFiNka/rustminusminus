import { requireBotOwner } from "../../permissions/web";
import { ok } from "./shared";

/**
 * What the app shell needs to know about the session itself, independent of any guild - currently
 * just whether this is the bot owner, which is what shows the global Modules link.
 *
 * Deliberately never fails: it backs the root layout loader, so a 401 here would take down every
 * page rather than hiding one nav item. Everything it gates is re-checked server-side anyway.
 */
export async function getSessionData(cookieToken: string | undefined) {
    return ok({ isBotOwner: await requireBotOwner(cookieToken) });
}
