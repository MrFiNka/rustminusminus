import type { RustPlus } from "rustminus";
import { AppMarkerType } from "rustminus";
import { getItemCatalog, type ItemDef } from "../../rustplus/itemCatalog";
import { toGridReference } from "../../rustplus/gridReference";
import type { MarketSnapshot, VendingMachine, VendingOrder } from "./types";

/** Item ids whose name or shortname contains `query` (case-insensitive), as the UI's fuzzy box does. */
async function matchingItemIds(query: string): Promise<Set<number>> {
    const catalog = await getItemCatalog();
    const needle = query.toLowerCase();
    return new Set(
        [...catalog.entries()]
            .filter(([, def]) => def.name.toLowerCase().includes(needle) || def.shortName.toLowerCase().includes(needle))
            .map(([id]) => id),
    );
}

function describe(catalog: Map<number, ItemDef>, itemId: number): ItemDef {
    return catalog.get(itemId) ?? { name: `item ${itemId}`, shortName: "" };
}

/**
 * Every vending machine on the server and every order on it - including out-of-stock orders, which
 * the browser greys out rather than hides.
 *
 * One `getMapMarkers()`/`getInfo()` pair covers the whole market, so callers fetch this once and
 * filter in memory rather than issuing a Rust+ call per query.
 */
export async function listVendingMachines(rustplus: RustPlus): Promise<MarketSnapshot> {
    const [catalog, markers, info] = await Promise.all([getItemCatalog(), rustplus.getMapMarkers(), rustplus.getInfo()]);
    const fetchedAt = Date.now();
    const machines: VendingMachine[] = [];

    for (const marker of markers) {
        if (marker.type !== AppMarkerType.VendingMachine) continue;
        const grid = toGridReference(marker.x, marker.y, info.mapSize);
        const orders: VendingOrder[] = marker.sellOrders.map(order => {
            const item = describe(catalog, order.itemId);
            const currency = describe(catalog, order.currencyId);
            return {
                machineId: marker.id,
                machineName: marker.name,
                x: marker.x,
                y: marker.y,
                grid,
                itemId: order.itemId,
                itemName: item.name,
                itemShortName: item.shortName,
                quantity: order.quantity,
                costPerItem: order.costPerItem,
                currencyId: order.currencyId,
                currencyName: currency.name,
                currencyShortName: currency.shortName,
                amountInStock: order.amountInStock,
                itemIsBlueprint: order.itemIsBlueprint,
                currencyIsBlueprint: order.currencyIsBlueprint,
                itemCondition: order.itemCondition,
                itemConditionMax: order.itemConditionMax,
            };
        });
        machines.push({ machineId: marker.id, name: marker.name, x: marker.x, y: marker.y, grid, orders });
    }

    return { machines, fetchedAt, mapSize: info.mapSize };
}

/**
 * Which half of a trade the query is about.
 *
 * `"sell"` - machines selling the item, which is all the search could ever do before.
 * `"buy"` - machines *paying* in it, i.e. "who will take my scrap", which is half of what people
 * actually use vending machines for and was unanswerable.
 */
export type MarketSide = "sell" | "buy" | "both";

/** Pure predicate over an already-fetched snapshot, so the watch evaluator can reuse the matching
 *  rules without a second Rust+ call. */
export function orderMatches(order: VendingOrder, matchingIds: Set<number>, side: MarketSide): boolean {
    if (side !== "buy" && matchingIds.has(order.itemId)) return true;
    if (side !== "sell" && matchingIds.has(order.currencyId)) return true;
    return false;
}

/**
 * Orders matching `query`, as structured records.
 *
 * `side` defaults to `"sell"` deliberately: the in-game and Discord commands call this and their
 * output must not change under them, so opting into buy-side matching is the web browser's choice
 * to make. Out-of-stock orders are included; callers wanting only buyable listings use
 * {@link searchInStock}, which keeps that decision at the surface that cares rather than buried here.
 */
export async function searchVendingMachines(
    rustplus: RustPlus,
    query: string,
    side: MarketSide = "sell",
): Promise<VendingOrder[]> {
    const matchingIds = await matchingItemIds(query);
    if (matchingIds.size === 0) return [];

    const { machines } = await listVendingMachines(rustplus);
    return machines
        .flatMap(machine => machine.orders)
        .filter(order => orderMatches(order, matchingIds, side));
}

/** Orders matching `query` that can actually be bought right now - what the in-game and Discord
 *  commands list, matching their behaviour before the records refactor. */
export async function searchInStock(rustplus: RustPlus, query: string, side: MarketSide = "sell"): Promise<VendingOrder[]> {
    return (await searchVendingMachines(rustplus, query, side)).filter(order => order.amountInStock > 0);
}

export { matchingItemIds };
