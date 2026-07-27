import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { Toggle } from "../Toggle";
import type { VendingWatch } from "../../pages/serverDetail.types";
import type { VendingWatches } from "../../pages/useVendingWatches";
import type { MarketFilters } from "./marketFilters";

const SIDE_LABELS: Record<VendingWatch["side"], string> = {
    sell: "selling",
    buy: "paying in",
    both: "selling or paying in",
};

function describe(watch: VendingWatch): string {
    const parts = [`Shops ${SIDE_LABELS[watch.side]} “${watch.query}”`];
    if (watch.maxPrice !== null) parts.push(`at or under ${watch.maxPrice}/ea`);
    return parts.join(" ");
}

/**
 * Saved watches for this server, plus a one-click "watch these filters".
 *
 * Seeding a watch from the current filter set is the point of putting this inside the browser: you
 * find the thing you want by filtering for it, and the watch is the same query left running.
 */
export function WatchList({
    watches,
    filters,
    canManage,
}: {
    watches: VendingWatches;
    /** The panel's current filter state, offered as the new watch's criteria. */
    filters: MarketFilters;
    /** False when the session lacks `vending.watch` - the list stays visible, the controls don't. */
    canManage: boolean;
}) {
    const canSeed = filters.query.trim().length > 0;

    return (
        <div className="mt-1 border-t border-border/60 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                    <Bell className="h-3.5 w-3.5" />
                    Watches
                    {watches.watches.length > 0 && (
                        <span className="rounded-full bg-surface-hover px-1.5 text-[10px] text-neutral-500">
                            {watches.watches.length}
                        </span>
                    )}
                </h4>
                {canManage && (
                    <button
                        onClick={() => void watches.create({
                            query: filters.query.trim(),
                            side: filters.side,
                            maxPrice: filters.maxPrice,
                        })}
                        disabled={!canSeed || watches.busy}
                        title={canSeed ? "Alert in Discord when these filters match" : "Type an item filter first"}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-neutral-400 transition-colors hover:border-accent hover:text-white disabled:opacity-40"
                    >
                        <Plus className="h-3 w-3" />
                        Watch these filters
                    </button>
                )}
            </div>

            {watches.error && <p className="mb-2 text-xs text-red-400">{watches.error}</p>}

            {watches.watches.length === 0 ? (
                <p className="text-xs text-neutral-600">
                    {canManage
                        ? "No watches yet — filter for something, then save it to get a Discord alert when it appears."
                        : "No watches on this server."}
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-border/40">
                    {watches.watches.map((watch) => (
                        <li key={watch.id} className="flex items-center gap-2 py-1.5">
                            <span className={`shrink-0 ${watch.enabled ? "text-accent" : "text-neutral-700"}`}>
                                {watch.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                            </span>
                            <span className={`min-w-0 flex-1 truncate text-xs ${watch.enabled ? "text-neutral-300" : "text-neutral-600"}`}>
                                {describe(watch)}
                            </span>
                            {watch.lastAlertedAt && (
                                <span className="shrink-0 text-[10px] text-neutral-600">
                                    last fired {new Date(watch.lastAlertedAt).toLocaleDateString()}
                                </span>
                            )}
                            {canManage && (
                                <>
                                    <Toggle
                                        checked={watch.enabled}
                                        onChange={(checked) => void watches.setEnabled(watch.id, checked)}
                                    />
                                    <button
                                        onClick={() => void watches.remove(watch.id)}
                                        disabled={watches.busy}
                                        className="shrink-0 text-neutral-600 transition-colors hover:text-red-400 disabled:opacity-40"
                                        title="Delete this watch"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
