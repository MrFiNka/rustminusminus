import { useCallback, useEffect, useState } from "react";
import type { MapMeta, MarketResponse, MarketSnapshot, MarketUnavailable } from "./serverDetail.types";

export interface ServerMapData {
    meta: MapMeta | null;
    metaError: string | null;
    market: MarketSnapshot | null;
    marketUnavailable: MarketUnavailable | null;
    marketError: string | null;
    marketLoading: boolean;
    refreshMarket: () => void;
}

interface MetaState {
    key: string | null;
    meta: MapMeta | null;
    error: string | null;
}

interface MarketState {
    key: string | null;
    snapshot: MarketSnapshot | null;
    unavailable: MarketUnavailable | null;
    error: string | null;
    /** Loaded token, compared against the requested one to derive "is loading" without a setState
     *  before every fetch. */
    token: number;
}

const NO_META: MetaState = { key: null, meta: null, error: null };
const NO_MARKET: MarketState = { key: null, snapshot: null, unavailable: null, error: null, token: -1 };

/**
 * Loads the two payloads the map and market panels sit on: the wipe-stable map metadata (geometry +
 * monuments) and the market snapshot.
 *
 * They're fetched separately on purpose. The metadata is cached hard on both sides and only changes
 * on wipe, while the market is a point-in-time read the user can refresh - bundling them would mean
 * either re-reading the map on every refresh or serving a stale market from the map's cache window.
 *
 * Both results are tagged with the request they answer (the server key, and for the market a refresh
 * token), so a change of target or an in-flight refresh is resolved at render instead of by resetting
 * state from inside the effect - the same discipline `useLiveSocket` uses, and what keeps a
 * navigation from showing the previous server's market for a frame.
 *
 * `wantMarket` gates the market fetch on the vending-search module being enabled, so a team that
 * doesn't use it never pays for the call.
 */
export function useServerMapData(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    wantMarket: boolean,
): ServerMapData {
    const base = guildId && teamId && serverId
        ? `/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}`
        : null;

    const [metaState, setMetaState] = useState<MetaState>(NO_META);
    const [marketState, setMarketState] = useState<MarketState>(NO_MARKET);
    const [token, setToken] = useState(0);

    const refreshMarket = useCallback(() => setToken((n) => n + 1), []);

    useEffect(() => {
        if (!base) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(`${base}/map-meta`);
                const json = await res.json();
                if (cancelled) return;
                setMetaState(res.ok
                    ? { key: base, meta: json as MapMeta, error: null }
                    : { key: base, meta: null, error: json?.error ?? "Couldn't load the map" });
            } catch {
                if (!cancelled) setMetaState({ key: base, meta: null, error: "Couldn't load the map" });
            }
        })();
        return () => { cancelled = true; };
    }, [base]);

    useEffect(() => {
        if (!base || !wantMarket) return;
        let cancelled = false;
        void (async () => {
            const settle = (patch: Partial<MarketState>) => {
                if (!cancelled) setMarketState({ key: base, snapshot: null, unavailable: null, error: null, token, ...patch });
            };
            try {
                const res = await fetch(`${base}/market`);
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok) return settle({ error: json?.error ?? "Couldn't load the market" });
                const body = json as MarketResponse;
                // "unavailable" is a state, not a failure - the panel explains it in place of the
                // list rather than showing an error banner.
                if ("unavailable" in body) return settle({ unavailable: body.unavailable });
                settle({ snapshot: body });
            } catch {
                settle({ error: "Couldn't load the market" });
            }
        })();
        return () => { cancelled = true; };
    }, [base, wantMarket, token]);

    // Held results that answer a different target are reported as absent, not shown against the
    // wrong server.
    const meta = metaState.key === base ? metaState : NO_META;
    const market = marketState.key === base ? marketState : NO_MARKET;

    return {
        meta: meta.meta,
        metaError: meta.error,
        market: market.snapshot,
        marketUnavailable: market.unavailable,
        marketError: market.error,
        // Loading whenever the settled token is behind the requested one - covers both the first load
        // and every manual refresh, with no state write at fetch time.
        marketLoading: wantMarket && base !== null && market.token !== token,
        refreshMarket,
    };
}
