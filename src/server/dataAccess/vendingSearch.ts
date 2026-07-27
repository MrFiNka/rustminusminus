import { getActiveRustplus } from "../../rustplus/connections";
import { listVendingMachines } from "../../modules/vending-search/search";
import type { MarketSnapshot } from "../../modules/vending-search/types";
import { ok, requireTeamModuleEnabled } from "./shared";

/**
 * Why a server's market can't be read right now, when it can't.
 *
 * Returned as a successful result rather than a 400, because neither case is a failure: vending data
 * needs a live connection and only the active server has one. The browser explains the situation in
 * place of the panel instead of showing a red error banner for what is really a precondition - which
 * is what the old bare 400 forced it to do.
 */
export type MarketUnavailable = "not-active-server" | "not-connected";

export type MarketResult = MarketSnapshot | { unavailable: MarketUnavailable };

/**
 * The whole market for a team's active server: every machine, every order, in one payload.
 *
 * Deliberately not a search endpoint. A wiped server carries on the order of 10^2-10^3 orders total,
 * which is a small JSON document, so the browser loads it once and filters client-side - instant
 * filtering, and one Rust+ call instead of one per keystroke.
 */
export async function listMarket(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
) {
    const auth = await requireTeamModuleEnabled(cookieToken, guildId, teamId, "vending-search");
    if (!auth.ok) return auth;

    const { team } = auth.data;
    if (serverId !== team.activeServerId) return ok<MarketResult>({ unavailable: "not-active-server" });
    const conn = getActiveRustplus(team._id);
    if (!conn?.isConnected()) return ok<MarketResult>({ unavailable: "not-connected" });

    return ok<MarketResult>(await listVendingMachines(conn));
}
