import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, VendingMachine, VendingOrder } from "../../pages/serverDetail.types";
import { EMPTY_FILTERS, buildRows, costPerUnit, isDamaged, orderPasses } from "./marketFilters";

function order(overrides: Partial<VendingOrder> = {}): VendingOrder {
    return {
        machineId: 1,
        x: 0,
        y: 0,
        grid: "K14",
        itemId: 1,
        itemName: "Rifle Body",
        itemShortName: "riflebody",
        quantity: 1,
        costPerItem: 250,
        currencyId: 2,
        currencyName: "Scrap",
        currencyShortName: "scrap",
        amountInStock: 3,
        itemIsBlueprint: false,
        currencyIsBlueprint: false,
        ...overrides,
    };
}

function machine(id: number, orders: VendingOrder[], overrides: Partial<VendingMachine> = {}): VendingMachine {
    return {
        machineId: id,
        x: 0,
        y: 0,
        grid: "K14",
        orders: orders.map(o => ({ ...o, machineId: id })),
        ...overrides,
    };
}

function snapshot(machines: VendingMachine[]): MarketSnapshot {
    return { machines, fetchedAt: 0, mapSize: 4000 };
}

describe("costPerUnit", () => {
    test("divides by quantity - the comparison the string form could not express", () => {
        expect(costPerUnit(order({ quantity: 5, costPerItem: 1000 }))).toBe(200);
        expect(costPerUnit(order({ quantity: 1, costPerItem: 250 }))).toBe(250);
    });

    test("a zero quantity falls back to the raw price instead of dividing by zero", () => {
        expect(costPerUnit(order({ quantity: 0, costPerItem: 250 }))).toBe(250);
    });
});

describe("isDamaged", () => {
    test("true only when condition is below its maximum", () => {
        expect(isDamaged(order({ itemCondition: 40, itemConditionMax: 100 }))).toBe(true);
        expect(isDamaged(order({ itemCondition: 100, itemConditionMax: 100 }))).toBe(false);
        expect(isDamaged(order())).toBe(false);
    });
});

describe("orderPasses", () => {
    test("text matches item name or shortname", () => {
        const filters = { ...EMPTY_FILTERS, query: "riflebody" };
        expect(orderPasses(order(), filters)).toBe(true);
        expect(orderPasses(order(), { ...EMPTY_FILTERS, query: "rifle bo" })).toBe(true);
        expect(orderPasses(order(), { ...EMPTY_FILTERS, query: "door" })).toBe(false);
    });

    /** The capability the old search structurally lacked: finding who will *pay* in an item. */
    test("buy side matches the currency instead of the item", () => {
        const buyScrap = { ...EMPTY_FILTERS, query: "scrap", side: "buy" as const };
        expect(orderPasses(order(), buyScrap)).toBe(true);
        expect(orderPasses(order({ currencyName: "Cloth", currencyShortName: "cloth" }), buyScrap)).toBe(false);

        // ...and sell side must NOT match on currency, or "buy" would be meaningless.
        expect(orderPasses(order(), { ...EMPTY_FILTERS, query: "scrap", side: "sell" })).toBe(false);
    });

    test("in-stock-only drops sold-out listings, which are kept by default", () => {
        const soldOut = order({ amountInStock: 0 });
        expect(orderPasses(soldOut, EMPTY_FILTERS)).toBe(true);
        expect(orderPasses(soldOut, { ...EMPTY_FILTERS, inStockOnly: true })).toBe(false);
    });

    test("max price is compared per unit, not per purchase", () => {
        const bulk = order({ quantity: 5, costPerItem: 1000 });
        expect(orderPasses(bulk, { ...EMPTY_FILTERS, maxPrice: 250 })).toBe(true);
        expect(orderPasses(bulk, { ...EMPTY_FILTERS, maxPrice: 150 })).toBe(false);
    });

    test("grid filter is a prefix, so a column letter selects the whole column", () => {
        expect(orderPasses(order({ grid: "K14" }), { ...EMPTY_FILTERS, grid: "K" })).toBe(true);
        expect(orderPasses(order({ grid: "K14" }), { ...EMPTY_FILTERS, grid: "k14" })).toBe(true);
        expect(orderPasses(order({ grid: "B7" }), { ...EMPTY_FILTERS, grid: "K" })).toBe(false);
    });

    test("blueprint and damaged filters", () => {
        expect(orderPasses(order({ itemIsBlueprint: true }), { ...EMPTY_FILTERS, blueprintsOnly: true })).toBe(true);
        expect(orderPasses(order(), { ...EMPTY_FILTERS, blueprintsOnly: true })).toBe(false);
        expect(orderPasses(order({ itemCondition: 10, itemConditionMax: 100 }), { ...EMPTY_FILTERS, damagedOnly: true })).toBe(true);
        expect(orderPasses(order(), { ...EMPTY_FILTERS, damagedOnly: true })).toBe(false);
    });

    test("machineId restricts to one shop - what clicking a pin does", () => {
        expect(orderPasses(order({ machineId: 7 }), { ...EMPTY_FILTERS, machineId: 7 })).toBe(true);
        expect(orderPasses(order({ machineId: 8 }), { ...EMPTY_FILTERS, machineId: 7 })).toBe(false);
    });
});

describe("buildRows", () => {
    const cheap = machine(1, [order({ costPerItem: 100 })], { name: "Cheap Shop", x: 100, y: 100 });
    const bulk = machine(2, [order({ costPerItem: 1000, quantity: 20, amountInStock: 50 })], { name: "Bulk", x: 3000, y: 3000 });
    const soldOut = machine(3, [order({ costPerItem: 10, amountInStock: 0 })], { name: "Empty", x: 500, y: 500 });
    const market = snapshot([bulk, soldOut, cheap]);

    test("drops machines with no passing orders entirely", () => {
        const rows = buildRows(market, { ...EMPTY_FILTERS, query: "door" }, "cheapest", null);
        expect(rows).toHaveLength(0);
    });

    test("groups by machine rather than listing loose orders", () => {
        const many = machine(4, [order({ costPerItem: 1 }), order({ costPerItem: 2 }), order({ costPerItem: 3 })]);
        const rows = buildRows(snapshot([many]), EMPTY_FILTERS, "cheapest", null);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.orders).toHaveLength(3);
    });

    test("cheapest sorts on per-unit price, so bulk beats a lower sticker price", () => {
        // Bulk is 1000 for 20 = 50/unit, cheaper per unit than Cheap Shop's 100 for 1.
        const rows = buildRows(market, EMPTY_FILTERS, "cheapest", null);
        expect(rows.map(r => r.machine.name)).toEqual(["Bulk", "Cheap Shop", "Empty"]);
    });

    test("a sold-out shop sorts last on price rather than counting as free", () => {
        const rows = buildRows(market, EMPTY_FILTERS, "cheapest", null);
        expect(rows.at(-1)!.machine.name).toBe("Empty");
        expect(rows.at(-1)!.bestPrice).toBeNull();
    });

    test("nearest sorts by distance from the given origin", () => {
        const rows = buildRows(market, EMPTY_FILTERS, "nearest", { x: 0, y: 0 });
        expect(rows.map(r => r.machine.name)).toEqual(["Cheap Shop", "Empty", "Bulk"]);
    });

    test("nearest is stable when there's no origin to measure from", () => {
        const rows = buildRows(market, EMPTY_FILTERS, "nearest", null);
        expect(rows).toHaveLength(3);
    });

    test("stock sorts by total units available", () => {
        const rows = buildRows(market, EMPTY_FILTERS, "stock", null);
        expect(rows[0]!.machine.name).toBe("Bulk");
    });

    test("orders within a shop lead with the best per-unit offer", () => {
        const mixed = machine(5, [
            order({ costPerItem: 300, quantity: 1 }),
            order({ costPerItem: 100, quantity: 1 }),
            order({ costPerItem: 400, quantity: 4 }),
        ]);
        const rows = buildRows(snapshot([mixed]), EMPTY_FILTERS, "cheapest", null);
        expect(rows[0]!.orders.map(costPerUnit)).toEqual([100, 100, 300]);
    });
});
