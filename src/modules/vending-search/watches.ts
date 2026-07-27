import type { VendingWatchClass } from "../../models/VendingWatch";
import type { MarketSide } from "./search";
import type { MarketSnapshot, VendingOrder } from "./types";

/** The criteria half of a watch - everything needed to decide whether an order matches. Split out
 *  from the Mongoose document so the evaluation is testable without a database. */
export interface WatchCriteria {
    query: string;
    side: MarketSide;
    maxPrice: number | null;
    currencyId: number | null;
}

export function criteriaOf(watch: VendingWatchClass): WatchCriteria {
    return { query: watch.query, side: watch.side, maxPrice: watch.maxPrice, currencyId: watch.currencyId };
}

/**
 * Identity of an *offer*, not of an order object.
 *
 * Machine + item + price, deliberately excluding stock level: a shop restocking the same item at the
 * same price is the same offer, so it must not re-alert. A price change, on the other hand, is a new
 * offer worth knowing about - which is why cost is in the key.
 */
export function fingerprint(order: VendingOrder): string {
    return `${order.machineId}:${order.itemId}:${order.costPerItem}`;
}

/** Price of a single unit - what `maxPrice` is compared against, since a bulk listing's sticker
 *  price says nothing about whether it's cheap. */
export function costPerUnit(order: VendingOrder): number {
    return order.quantity > 0 ? order.costPerItem / order.quantity : order.costPerItem;
}

function matchesQuery(order: VendingOrder, needle: string, side: MarketSide): boolean {
    if (!needle) return true;
    const sellSide = order.itemName.toLowerCase().includes(needle) || order.itemShortName.toLowerCase().includes(needle);
    const buySide = order.currencyName.toLowerCase().includes(needle) || order.currencyShortName.toLowerCase().includes(needle);
    if (side === "sell") return sellSide;
    if (side === "buy") return buySide;
    return sellSide || buySide;
}

/**
 * Whether an order satisfies a watch right now.
 *
 * Out-of-stock orders never match: a watch exists to say "you can buy this now", and a listing with
 * nothing behind it can't be acted on. This is also what makes restocking an edge - the offer leaves
 * the matching set when it empties and re-enters when it refills.
 */
export function matches(order: VendingOrder, criteria: WatchCriteria): boolean {
    if (order.amountInStock <= 0) return false;
    if (!matchesQuery(order, criteria.query.trim().toLowerCase(), criteria.side)) return false;
    if (criteria.currencyId !== null && order.currencyId !== criteria.currencyId) return false;
    if (criteria.maxPrice !== null && costPerUnit(order) > criteria.maxPrice) return false;
    return true;
}

export interface WatchEvaluation {
    /** Orders that have just *entered* the matching state - the only ones worth alerting on. */
    triggered: VendingOrder[];
    /** Fingerprints matching now, to persist as the next comparison baseline. */
    fingerprints: string[];
}

/**
 * Evaluates one watch against a market snapshot, edge-triggered against the previous evaluation.
 *
 * The three conditions the feature promises - "item appears in stock", "price drops to at or below
 * a threshold", "a listing restocks" - are all this same computation. Each is an offer entering the
 * matching set: a new listing has a fingerprint that wasn't there, a price cut produces a *different*
 * fingerprint (cost is part of it), and a restock re-enters because empty orders never match.
 *
 * `previous` is the watch's stored fingerprint set. An empty one on a brand-new watch means its first
 * evaluation alerts on everything currently matching, which is the intent: you made the watch because
 * you want to know, and if it's already available you want to know that first.
 */
export function evaluateWatch(
    snapshot: MarketSnapshot,
    criteria: WatchCriteria,
    previous: readonly string[],
): WatchEvaluation {
    const seen = new Set(previous);
    const triggered: VendingOrder[] = [];
    const fingerprints = new Set<string>();

    for (const machine of snapshot.machines) {
        for (const order of machine.orders) {
            if (!matches(order, criteria)) continue;
            const id = fingerprint(order);
            // A shop can list the same item at the same price on two slots; dedupe so one offer
            // produces one alert line.
            if (fingerprints.has(id)) continue;
            fingerprints.add(id);
            if (!seen.has(id)) triggered.push(order);
        }
    }

    return { triggered, fingerprints: [...fingerprints] };
}
