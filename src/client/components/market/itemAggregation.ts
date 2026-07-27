import type { MarketSnapshot, VendingOrder } from "../../pages/serverDetail.types";
import { costPerUnit, orderPasses, type MarketFilters } from "./marketFilters";

/** The cheapest per-unit price of one item in one currency. */
export interface ItemPrice {
    currencyId: number;
    currencyName: string;
    currencyShortName: string;
    unitPrice: number;
    /** How many passing orders are priced in this currency - decides which currency leads. */
    listings: number;
}

/** One item as the grid shows it: everything on sale of that good, across every shop. */
export interface ItemCard {
    /** `${itemId}:bp` / `${itemId}:` - a blueprint is a different good from the crafted item. */
    key: string;
    itemId: number;
    name: string;
    shortName: string;
    isBlueprint: boolean;
    /** Passing orders selling this item, cheapest per unit first, sold-out last. */
    orders: VendingOrder[];
    /** Distinct machines - a shop listing the same item three times counts once. */
    shopCount: number;
    totalStock: number;
    /** Cheapest per currency, most-listed currency first. */
    prices: ItemPrice[];
    /** Distance in world units to the closest shop stocking it, when an origin is known. */
    nearest: number | null;
}

export type ItemSort = "shops" | "cheapest" | "stock" | "nearest" | "name";

/** Whether anything on this card can actually be bought right now. */
export function isSoldOut(item: ItemCard): boolean {
    return item.totalStock <= 0;
}

/** The shops selling this item - what hovering a card highlights on the map. */
export function machineIds(item: ItemCard): number[] {
    return [...new Set(item.orders.map(o => o.machineId))];
}

/**
 * Cheapest per unit in each currency the item is priced in.
 *
 * Priced off in-stock orders only, so a sold-out listing can't advertise a number nobody can pay.
 * An item with nothing in stock falls back to all of its orders - the card still says what it went
 * for, and marks itself sold out.
 */
function pricesFor(orders: VendingOrder[]): ItemPrice[] {
    const inStock = orders.filter(o => o.amountInStock > 0);
    const priced = inStock.length > 0 ? inStock : orders;

    const byCurrency = new Map<number, ItemPrice>();
    for (const order of priced) {
        const unit = costPerUnit(order);
        const held = byCurrency.get(order.currencyId);
        if (!held) {
            byCurrency.set(order.currencyId, {
                currencyId: order.currencyId,
                currencyName: order.currencyName,
                currencyShortName: order.currencyShortName,
                unitPrice: unit,
                listings: 1,
            });
            continue;
        }
        held.listings += 1;
        if (unit < held.unitPrice) held.unitPrice = unit;
    }

    // Most-listed first: with mixed currencies the dominant one is the price people mean.
    return [...byCurrency.values()].sort((a, b) => b.listings - a.listings || a.unitPrice - b.unitPrice);
}

/**
 * Groups the passing orders by the item they sell, rather than by the shop selling them.
 *
 * The shop-grouped view (`buildRows`) answers "what does this shop sell?"; this answers the question
 * people actually bring to a market - "who sells this, and for how much?" - which the grouped view
 * could only answer by filtering to one item and reading prices out of ten expanded rows.
 *
 * Blueprints are their own item: a blueprint and the thing it teaches are different goods at wildly
 * different prices. Damaged variants are *not* - condition is a property of the individual listing,
 * so it stays a badge on the row.
 */
export function buildItems(
    snapshot: MarketSnapshot,
    filters: MarketFilters,
    sort: ItemSort,
    origin: { x: number; y: number } | null,
): ItemCard[] {
    const grouped = new Map<string, { orders: VendingOrder[]; nearest: number | null }>();

    for (const machine of snapshot.machines) {
        const distance = origin ? Math.hypot(machine.x - origin.x, machine.y - origin.y) : null;
        for (const order of machine.orders) {
            if (!orderPasses(order, filters)) continue;
            const key = `${order.itemId}:${order.itemIsBlueprint ? "bp" : ""}`;
            // Nearest shop *stocking* it - a sold-out shop next door isn't the one you'd drive to.
            const stocked = order.amountInStock > 0 ? distance : null;
            const held = grouped.get(key);
            if (!held) {
                grouped.set(key, { orders: [order], nearest: stocked });
                continue;
            }
            held.orders.push(order);
            if (stocked !== null && (held.nearest === null || stocked < held.nearest)) held.nearest = stocked;
        }
    }

    const items: ItemCard[] = [];
    for (const [key, { orders, nearest }] of grouped) {
        const first = orders[0]!;
        items.push({
            key,
            itemId: first.itemId,
            name: first.itemName,
            shortName: first.itemShortName,
            isBlueprint: first.itemIsBlueprint,
            // Cheapest first, but sold-out listings sink: they're context, not offers.
            orders: [...orders].sort((a, b) =>
                Number(a.amountInStock <= 0) - Number(b.amountInStock <= 0) || costPerUnit(a) - costPerUnit(b)),
            shopCount: new Set(orders.map(o => o.machineId)).size,
            totalStock: orders.reduce((sum, o) => sum + Math.max(0, o.amountInStock), 0),
            prices: pricesFor(orders),
            nearest,
        });
    }

    const byName = (a: ItemCard, b: ItemCard) => a.name.localeCompare(b.name);
    /** The leading currency's price, or Infinity for an item with nothing to sell. */
    const lead = (item: ItemCard) => (isSoldOut(item) ? Infinity : item.prices[0]?.unitPrice ?? Infinity);

    switch (sort) {
        case "shops":
            return items.sort((a, b) => b.shopCount - a.shopCount || byName(a, b));
        case "cheapest":
            // Approximate by construction: one number per item means comparing across currencies, so
            // this ranks on the *dominant* currency and leaves the honest per-currency breakdown to
            // the card. Sold-out items sort last rather than reading as free.
            return items.sort((a, b) => lead(a) - lead(b) || byName(a, b));
        case "stock":
            return items.sort((a, b) => b.totalStock - a.totalStock || byName(a, b));
        case "nearest":
            return items.sort((a, b) => (a.nearest ?? Infinity) - (b.nearest ?? Infinity) || byName(a, b));
        case "name":
            return items.sort(byName);
    }
}
