import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import type { MarketSnapshot, MarketUnavailable, VendingOrder } from "../../pages/serverDetail.types";
import { relativeTime } from "../../pages/serverDetail.utils";
import type { VendingWatches } from "../../pages/useVendingWatches";
import { WatchList } from "./WatchList";
import {
    EMPTY_FILTERS,
    buildRows,
    costPerUnit,
    isDamaged,
    type MarketFilters,
    type MarketSort,
} from "./marketFilters";

const inputClass =
    "rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50";

const SORT_LABELS: Record<MarketSort, string> = {
    cheapest: "Cheapest per unit",
    stock: "Most stock",
    nearest: "Nearest to team",
    name: "Shop name",
};

const UNAVAILABLE_TEXT: Record<MarketUnavailable, string> = {
    "not-active-server":
        "Vending data needs a live connection, and only the team's active server has one. Make this the active server to browse its market.",
    "not-connected":
        "This is the active server, but the bot isn't connected to it right now. The market will load once the connection is back.",
};

export interface MarketPanelProps {
    snapshot: MarketSnapshot | null;
    unavailable: MarketUnavailable | null;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    /** Team centroid, for the "nearest" sort. Null when no positions are known. */
    origin: { x: number; y: number } | null;
    /** Machine the map wants shown - set when a pin is clicked. */
    machineFilter: number | null;
    onMachineFilterChange: (machineId: number | null) => void;
    /** Fired on row hover, so the matching pin can highlight. */
    onHoverMachine: (machineId: number | null) => void;
    /** Fired on row click, so the map can fly to the shop. */
    onFocusMachine: (machineId: number) => void;
    watches: VendingWatches;
    /** Whether the session holds `vending.watch`. The routes are the real gate; this hides controls
     *  that would only 401. */
    canManageWatches: boolean;
}

/** Price line for one order: total, and per-unit when they differ. */
function priceLabel(order: VendingOrder): string {
    const unit = costPerUnit(order);
    const base = `${order.costPerItem} ${order.currencyName}`;
    return order.quantity > 1 ? `${base} (${unit.toFixed(unit < 10 ? 1 : 0)}/ea)` : base;
}

function OrderRow({ order }: { order: VendingOrder }) {
    const damaged = isDamaged(order);
    return (
        <li className={`flex items-center justify-between gap-3 py-1 ${order.amountInStock <= 0 ? "opacity-45" : ""}`}>
            <span className="flex min-w-0 items-center gap-1.5">
                {order.itemShortName && (
                    <img src={`https://cdn.carbonmod.gg/items/${order.itemShortName}.png`} alt="" className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate text-xs text-neutral-200">
                    {order.itemName} ×{order.quantity}
                </span>
                {order.itemIsBlueprint && (
                    <span className="shrink-0 rounded bg-sky-500/15 px-1 py-px text-[10px] font-medium text-sky-300">BP</span>
                )}
                {damaged && (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-300">
                        {Math.round((order.itemCondition! / order.itemConditionMax!) * 100)}%
                    </span>
                )}
            </span>
            <span className="shrink-0 text-right text-xs">
                <span className="text-neutral-300">{priceLabel(order)}</span>
                <span className="ml-2 text-neutral-600">
                    {order.amountInStock > 0 ? `${order.amountInStock} left` : "out of stock"}
                </span>
            </span>
        </li>
    );
}

/**
 * The market browser: the whole market loaded once, filtered and sorted in the browser.
 *
 * Client-side filtering is deliberate - a wiped server is on the order of 10^2-10^3 orders, which is
 * a small payload, and it makes filtering instant instead of one round trip per keystroke.
 */
export function MarketPanel({
    snapshot,
    unavailable,
    loading,
    error,
    onRefresh,
    origin,
    machineFilter,
    onMachineFilterChange,
    onHoverMachine,
    onFocusMachine,
    watches,
    canManageWatches,
}: MarketPanelProps) {
    const [filters, setFilters] = useState<MarketFilters>(EMPTY_FILTERS);
    const [sort, setSort] = useState<MarketSort>("cheapest");
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const update = <K extends keyof MarketFilters>(key: K, value: MarketFilters[K]) =>
        setFilters((prev) => ({ ...prev, [key]: value }));

    // The map owns the machine filter (clicking a pin sets it), so it's merged in here rather than
    // held in this component's own filter state.
    const effective = useMemo(() => ({ ...filters, machineId: machineFilter }), [filters, machineFilter]);

    const rows = useMemo(
        () => (snapshot ? buildRows(snapshot, effective, sort, origin) : []),
        [snapshot, effective, sort, origin],
    );

    const totalOrders = useMemo(
        () => snapshot?.machines.reduce((sum, m) => sum + m.orders.length, 0) ?? 0,
        [snapshot],
    );
    const shownOrders = rows.reduce((sum, r) => sum + r.orders.length, 0);

    const toggle = (machineId: number) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (!next.delete(machineId)) next.add(machineId);
            return next;
        });

    // Watches keep working while the market itself can't be read - they're evaluated server-side on
    // the module's tick, so managing them shouldn't require the page to have live data.
    const watchList = <WatchList watches={watches} filters={filters} canManage={canManageWatches} />;

    if (unavailable) {
        return (
            <div className="flex flex-col gap-3 p-3">
                <p className="text-sm text-neutral-500">{UNAVAILABLE_TEXT[unavailable]}</p>
                {watchList}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-45 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
                    <input
                        value={filters.query}
                        onChange={(e) => update("query", e.target.value)}
                        placeholder="Filter by item…"
                        className={`${inputClass} w-full pl-8`}
                    />
                </div>
                <select
                    value={filters.side}
                    onChange={(e) => update("side", e.target.value as MarketFilters["side"])}
                    className={inputClass}
                    title="Which side of the trade to match"
                >
                    <option value="both">Selling or buying</option>
                    <option value="sell">Shops selling it</option>
                    <option value="buy">Shops paying in it</option>
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as MarketSort)} className={inputClass}>
                    {(Object.keys(SORT_LABELS) as MarketSort[]).map((key) => (
                        <option key={key} value={key} disabled={key === "nearest" && !origin}>
                            {SORT_LABELS[key]}
                        </option>
                    ))}
                </select>
                <input
                    value={filters.grid}
                    onChange={(e) => update("grid", e.target.value)}
                    placeholder="Grid"
                    className={`${inputClass} w-20`}
                    title="Grid prefix, e.g. K or K14"
                />
                <input
                    type="number"
                    min={0}
                    value={filters.maxPrice ?? ""}
                    onChange={(e) => update("maxPrice", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="Max /ea"
                    className={`${inputClass} w-24`}
                    title="Maximum price per unit"
                />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {([
                    ["inStockOnly", "In stock"],
                    ["blueprintsOnly", "Blueprints"],
                    ["damagedOnly", "Damaged"],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => update(key, !filters[key])}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                            filters[key]
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : "border-border text-neutral-500 hover:text-neutral-300"
                        }`}
                    >
                        {label}
                    </button>
                ))}
                {machineFilter !== null && (
                    <button
                        onClick={() => onMachineFilterChange(null)}
                        className="flex items-center gap-1 rounded-full border border-accent/60 bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
                    >
                        One shop
                        <X className="h-3 w-3" />
                    </button>
                )}

                <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                    {snapshot && (
                        <span>
                            {shownOrders} of {totalOrders} listings · updated {relativeTime(new Date(snapshot.fetchedAt).toISOString())}
                        </span>
                    )}
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 transition-colors hover:border-accent hover:text-white disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {!snapshot && loading && <p className="text-xs text-neutral-500">Loading the market…</p>}

            {snapshot && rows.length === 0 && (
                <p className="text-xs text-neutral-500">
                    {totalOrders === 0 ? "No vending machines found on this server." : "No listings match these filters."}
                </p>
            )}

            <ul className="flex flex-col divide-y divide-border/60">
                {rows.map((row) => {
                    const open = expanded.has(row.machine.machineId);
                    return (
                        <li
                            key={row.machine.machineId}
                            onMouseEnter={() => onHoverMachine(row.machine.machineId)}
                            onMouseLeave={() => onHoverMachine(null)}
                        >
                            <div className="flex items-center gap-2 py-2">
                                <button
                                    onClick={() => toggle(row.machine.machineId)}
                                    className="shrink-0 text-neutral-600 transition-colors hover:text-white"
                                >
                                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                    onClick={() => onFocusMachine(row.machine.machineId)}
                                    className="min-w-0 flex-1 text-left"
                                    title="Show on the map"
                                >
                                    <span className="truncate text-sm text-neutral-200">
                                        {row.machine.name?.trim() || "Vending Machine"}
                                    </span>
                                    <span className="ml-2 font-mono text-xs text-neutral-500">{row.machine.grid}</span>
                                </button>
                                <span className="shrink-0 text-xs text-neutral-500">
                                    {row.orders.length} listing{row.orders.length === 1 ? "" : "s"}
                                    {row.bestPrice !== null && (
                                        <span className="ml-2 text-neutral-400">
                                            from {row.bestPrice.toFixed(row.bestPrice < 10 ? 1 : 0)}/ea
                                        </span>
                                    )}
                                </span>
                            </div>
                            {open && (
                                <ul className="mb-2 ml-6 flex flex-col">
                                    {row.orders.map((order, i) => (
                                        <OrderRow key={`${order.itemId}-${order.currencyId}-${i}`} order={order} />
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>

            {watchList}
        </div>
    );
}
