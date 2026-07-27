import { describe, expect, test } from "bun:test";
import { evaluateWatch, fingerprint, matches, type WatchCriteria } from "./watches";
import type { MarketSnapshot, VendingOrder } from "./types";

function order(overrides: Partial<VendingOrder> = {}): VendingOrder {
    return {
        machineId: 1,
        x: 0,
        y: 0,
        grid: "K14",
        itemId: 100,
        itemName: "Sheet Metal Door",
        itemShortName: "door.hinged.metal",
        quantity: 1,
        costPerItem: 40,
        currencyId: 200,
        currencyName: "Scrap",
        currencyShortName: "scrap",
        amountInStock: 5,
        itemIsBlueprint: false,
        currencyIsBlueprint: false,
        ...overrides,
    };
}

function market(orders: VendingOrder[]): MarketSnapshot {
    const byMachine = new Map<number, VendingOrder[]>();
    for (const o of orders) {
        if (!byMachine.has(o.machineId)) byMachine.set(o.machineId, []);
        byMachine.get(o.machineId)!.push(o);
    }
    return {
        machines: [...byMachine].map(([machineId, machineOrders]) => ({
            machineId,
            x: 0,
            y: 0,
            grid: "K14",
            orders: machineOrders,
        })),
        fetchedAt: 0,
        mapSize: 4000,
    };
}

const criteria: WatchCriteria = { query: "sheet metal door", side: "sell", maxPrice: 50, currencyId: null };

describe("fingerprint", () => {
    test("identifies an offer by machine, item and price - not by stock level", () => {
        expect(fingerprint(order({ amountInStock: 5 }))).toBe(fingerprint(order({ amountInStock: 99 })));
    });

    test("a price change is a different offer", () => {
        expect(fingerprint(order({ costPerItem: 40 }))).not.toBe(fingerprint(order({ costPerItem: 30 })));
    });

    test("the same item in two shops is two offers", () => {
        expect(fingerprint(order({ machineId: 1 }))).not.toBe(fingerprint(order({ machineId: 2 })));
    });
});

describe("matches", () => {
    test("an out-of-stock listing never matches, however well it fits otherwise", () => {
        expect(matches(order({ amountInStock: 0 }), criteria)).toBe(false);
    });

    test("respects the price ceiling, compared per unit", () => {
        expect(matches(order({ costPerItem: 45 }), criteria)).toBe(true);
        expect(matches(order({ costPerItem: 60 }), criteria)).toBe(false);
        // 200 for 5 units is 40/unit - under the ceiling despite the larger sticker price.
        expect(matches(order({ costPerItem: 200, quantity: 5 }), criteria)).toBe(true);
    });

    test("respects a currency restriction", () => {
        const scrapOnly = { ...criteria, currencyId: 200 };
        expect(matches(order(), scrapOnly)).toBe(true);
        expect(matches(order({ currencyId: 999 }), scrapOnly)).toBe(false);
    });

    test("side selects which half of the trade the query matches", () => {
        const buyScrap: WatchCriteria = { query: "scrap", side: "buy", maxPrice: null, currencyId: null };
        expect(matches(order(), buyScrap)).toBe(true);
        expect(matches(order(), { ...buyScrap, side: "sell" })).toBe(false);
    });
});

describe("evaluateWatch", () => {
    test("a brand-new watch alerts on everything already matching", () => {
        const result = evaluateWatch(market([order()]), criteria, []);
        expect(result.triggered).toHaveLength(1);
        expect(result.fingerprints).toHaveLength(1);
    });

    /** The whole reason fingerprints are persisted: level-triggering would spam for a week. */
    test("does not re-alert on an unchanged listing", () => {
        const snapshot = market([order()]);
        const first = evaluateWatch(snapshot, criteria, []);
        const second = evaluateWatch(snapshot, criteria, first.fingerprints);
        expect(second.triggered).toHaveLength(0);
        expect(second.fingerprints).toEqual(first.fingerprints);
    });

    test("alerts when a matching listing appears", () => {
        const before = evaluateWatch(market([]), criteria, []);
        const after = evaluateWatch(market([order()]), criteria, before.fingerprints);
        expect(after.triggered).toHaveLength(1);
    });

    test("alerts when the price drops to within the ceiling", () => {
        const expensive = evaluateWatch(market([order({ costPerItem: 90 })]), criteria, []);
        expect(expensive.triggered).toHaveLength(0);
        const cut = evaluateWatch(market([order({ costPerItem: 35 })]), criteria, expensive.fingerprints);
        expect(cut.triggered).toHaveLength(1);
    });

    test("alerts again when a sold-out listing restocks", () => {
        const stocked = evaluateWatch(market([order()]), criteria, []);
        expect(stocked.triggered).toHaveLength(1);

        const empty = evaluateWatch(market([order({ amountInStock: 0 })]), criteria, stocked.fingerprints);
        expect(empty.triggered).toHaveLength(0);
        // The offer left the matching set, so the baseline no longer contains it...
        expect(empty.fingerprints).toHaveLength(0);

        const restocked = evaluateWatch(market([order()]), criteria, empty.fingerprints);
        expect(restocked.triggered).toHaveLength(1);
    });

    test("one offer listed on two slots of a shop produces one alert", () => {
        const result = evaluateWatch(market([order(), order()]), criteria, []);
        expect(result.triggered).toHaveLength(1);
        expect(result.fingerprints).toHaveLength(1);
    });

    test("the same item in two shops produces two alerts", () => {
        const result = evaluateWatch(market([order({ machineId: 1 }), order({ machineId: 2 })]), criteria, []);
        expect(result.triggered).toHaveLength(2);
    });

    test("non-matching orders never enter the baseline", () => {
        const result = evaluateWatch(market([order({ itemName: "Rifle Body", itemShortName: "riflebody" })]), criteria, []);
        expect(result.triggered).toHaveLength(0);
        expect(result.fingerprints).toHaveLength(0);
    });
});
