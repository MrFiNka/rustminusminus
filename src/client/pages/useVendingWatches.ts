import { useCallback, useEffect, useState } from "react";
import type { VendingWatch } from "./serverDetail.types";

export interface WatchDraft {
    query: string;
    side: VendingWatch["side"];
    maxPrice: number | null;
}

export interface VendingWatches {
    watches: VendingWatch[];
    error: string | null;
    busy: boolean;
    create: (draft: WatchDraft) => Promise<void>;
    setEnabled: (watchId: string, enabled: boolean) => Promise<void>;
    remove: (watchId: string) => Promise<void>;
}

const NO_WATCHES: VendingWatch[] = [];

/**
 * The team's saved market watches for one server, with the mutations that manage them.
 *
 * Mutations re-read the list from the server rather than patching local state: the create route
 * applies its own validation (the per-team cap, the query length limit), so the authoritative list is
 * the one it hands back.
 *
 * `enabled` gates the whole thing on the vending-search module being on, so a team without it never
 * issues the request.
 */
export function useVendingWatches(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    enabled: boolean,
): VendingWatches {
    const base = enabled && guildId && teamId && serverId
        ? `/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/vending-watches`
        : null;
    const teamBase = guildId && teamId ? `/api/guilds/${guildId}/teams/${teamId}/vending-watches` : null;

    const [state, setState] = useState<{ key: string | null; watches: VendingWatch[]; error: string | null }>({
        key: null,
        watches: NO_WATCHES,
        error: null,
    });
    const [busy, setBusy] = useState(false);
    const [token, setToken] = useState(0);

    useEffect(() => {
        if (!base) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(base);
                const json = await res.json();
                if (cancelled) return;
                setState(res.ok
                    ? { key: base, watches: json.watches as VendingWatch[], error: null }
                    : { key: base, watches: NO_WATCHES, error: json?.error ?? "Couldn't load watches" });
            } catch {
                if (!cancelled) setState({ key: base, watches: NO_WATCHES, error: "Couldn't load watches" });
            }
        })();
        return () => { cancelled = true; };
    }, [base, token]);

    const reload = useCallback(() => setToken((n) => n + 1), []);

    /** Runs one mutation, surfacing its error and refreshing the list either way. */
    const mutate = useCallback(async (url: string, init: RequestInit) => {
        setBusy(true);
        try {
            const res = await fetch(url, init);
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                setState((prev) => ({ ...prev, error: json?.error ?? "That didn't work" }));
                return;
            }
            setState((prev) => ({ ...prev, error: null }));
            reload();
        } catch {
            setState((prev) => ({ ...prev, error: "That didn't work" }));
        } finally {
            setBusy(false);
        }
    }, [reload]);

    const create = useCallback(async (draft: WatchDraft) => {
        if (!base) return;
        await mutate(base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
        });
    }, [base, mutate]);

    const setEnabled = useCallback(async (watchId: string, isEnabled: boolean) => {
        if (!teamBase) return;
        await mutate(`${teamBase}/${watchId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: isEnabled }),
        });
    }, [teamBase, mutate]);

    const remove = useCallback(async (watchId: string) => {
        if (!teamBase) return;
        await mutate(`${teamBase}/${watchId}`, { method: "DELETE" });
    }, [teamBase, mutate]);

    // Held results that answer a different target are reported as absent, rather than showing one
    // server's watches against another's market.
    const current = state.key === base ? state : { watches: NO_WATCHES, error: null };
    return { watches: current.watches, error: current.error, busy, create, setEnabled, remove };
}
