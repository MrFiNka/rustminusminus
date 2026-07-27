import type { MarketSnapshot, VendingMachine, VendingOrder } from "../../pages/serverDetail.types";

/** Which side of the trade the text query is matched against. */
export type MarketSide = "sell" | "buy" | "both";

export type MarketSort = "cheapest" | "stock" | "nearest" | "name";

export interface MarketFilters {
    query: string;
    side: MarketSide;
    inStockOnly: boolean;
    blueprintsOnly: boolean;
    damagedOnly: boolean;
    /** Grid prefix, e.g. "K" for a column or "K14" for one cell. Empty = anywhere. */
    grid: string;
    maxPrice: number | null;
    /** Restricts to one machine - what clicking a map pin sets. */
    machineId: number | null;
}

export const EMPTY_FILTERS: MarketFilters = {
    query: "",
    side: "both",
    inStockOnly: false,
    blueprintsOnly: false,
    damagedOnly: false,
    grid: "",
    maxPrice: null,
    machineId: null,
};

/**
 * Price of a single unit.
 *
 * This is the number people actually compare, and it's the one the old string form structurally
 * could not express: "Rifle Body x1 for 250 Scrap" and "Rifle Body x5 for 1000 Scrap" sort the same
 * way on cost but not on value.
 */
export function costPerUnit(order: VendingOrder): number {
    return order.quantity > 0 ? order.costPerItem / order.quantity : order.costPerItem;
}

/** True when the order is for a damaged (used) item - a weapon or tool below full condition. */
export function isDamaged(order: VendingOrder): boolean {
    return order.itemCondition !== undefined
        && order.itemConditionMax !== undefined
        && order.itemConditionMax > 0
        && order.itemCondition < order.itemConditionMax;
}

function matchesText(order: VendingOrder, needle: string, side: MarketSide): boolean {
    if (!needle) return true;
    const sellSide = order.itemName.toLowerCase().includes(needle) || order.itemShortName.toLowerCase().includes(needle);
    const buySide = order.currencyName.toLowerCase().includes(needle) || order.currencyShortName.toLowerCase().includes(needle);
    if (side === "sell") return sellSide;
    if (side === "buy") return buySide;
    return sellSide || buySide;
}

export function orderPasses(order: VendingOrder, filters: MarketFilters): boolean {
    if (filters.machineId !== null && order.machineId !== filters.machineId) return false;
    if (!matchesText(order, filters.query.trim().toLowerCase(), filters.side)) return false;
    if (filters.inStockOnly && order.amountInStock <= 0) return false;
    if (filters.blueprintsOnly && !order.itemIsBlueprint) return false;
    if (filters.damagedOnly && !isDamaged(order)) return false;
    if (filters.maxPrice !== null && costPerUnit(order) > filters.maxPrice) return false;
    if (filters.grid && !order.grid.toUpperCase().startsWith(filters.grid.trim().toUpperCase())) return false;
    return true;
}

/** A machine with only its passing orders, plus the derived numbers the row header shows. */
export interface MarketRow {
    machine: VendingMachine;
    orders: VendingOrder[];
    /** Cheapest per-unit price among the passing orders that are actually in stock. */
    bestPrice: number | null;
    totalStock: number;
    /** Distance in world units to the team reference point, when one is known. */
    distance: number | null;
}

/**
 * Applies filters and sorting, grouped by machine.
 *
 * Grouping is the point: a shop is a coherent thing, and ten orders from one machine used to read as
 * ten unrelated results. Machines with no passing orders drop out entirely.
 */
export function buildRows(
    snapshot: MarketSnapshot,
    filters: MarketFilters,
    sort: MarketSort,
    origin: { x: number; y: number } | null,
): MarketRow[] {
    const rows: MarketRow[] = [];

    for (const machine of snapshot.machines) {
        const orders = machine.orders.filter(order => orderPasses(order, filters));
        if (orders.length === 0) continue;

        const inStock = orders.filter(o => o.amountInStock > 0);
        rows.push({
            machine,
            // Cheapest first within a shop, so the expanded list leads with the best offer.
            orders: [...orders].sort((a, b) => costPerUnit(a) - costPerUnit(b)),
            bestPrice: inStock.length ? Math.min(...inStock.map(costPerUnit)) : null,
            totalStock: orders.reduce((sum, o) => sum + Math.max(0, o.amountInStock), 0),
            distance: origin ? Math.hypot(machine.x - origin.x, machine.y - origin.y) : null,
        });
    }

    const byName = (a: MarketRow, b: MarketRow) =>
        (a.machine.name ?? a.machine.grid).localeCompare(b.machine.name ?? b.machine.grid);

    switch (sort) {
        case "cheapest":
            // Sold-out shops sort last rather than being treated as free.
            return rows.sort((a, b) =>
                (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity) || byName(a, b));
        case "stock":
            return rows.sort((a, b) => b.totalStock - a.totalStock || byName(a, b));
        case "nearest":
            return rows.sort((a, b) =>
                (a.distance ?? Infinity) - (b.distance ?? Infinity) || byName(a, b));
        case "name":
            return rows.sort(byName);
    }
}
