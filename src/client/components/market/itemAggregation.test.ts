import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, VendingMachine, VendingOrder } from "../../pages/serverDetail.types";
import { EMPTY_FILTERS } from "./marketFilters";
import { buildItems, isSoldOut, machineIds } from "./itemAggregation";

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

const cloth = { itemId: 2, itemName: "Cloth", itemShortName: "cloth" };

describe("buildItems - grouping", () => {
    test("collapses the same item across shops into one card", () => {
        const items = buildItems(
            snapshot([machine(1, [order()]), machine(2, [order()]), machine(3, [order()])]),
            EMPTY_FILTERS,
            "shops",
            null,
        );
        expect(items).toHaveLength(1);
        expect(items[0]!.name).toBe("Rifle Body");
        expect(items[0]!.shopCount).toBe(3);
        expect(items[0]!.orders).toHaveLength(3);
    });

    /** A blueprint and the thing it teaches are different goods at wildly different prices. */
    test("a blueprint is a separate card from the item of the same id", () => {
        const items = buildItems(
            snapshot([machine(1, [order(), order({ itemIsBlueprint: true, costPerItem: 5000 })])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        expect(items).toHaveLength(2);
        expect(items.map(i => i.isBlueprint).sort()).toEqual([false, true]);
        expect(new Set(items.map(i => i.key)).size).toBe(2);
    });

    /** Condition is a property of the listing, not of the good - it stays a badge on the row. */
    test("a damaged listing shares the card with the pristine one", () => {
        const items = buildItems(
            snapshot([machine(1, [order(), order({ itemCondition: 40, itemConditionMax: 100 })])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        expect(items).toHaveLength(1);
        expect(items[0]!.orders).toHaveLength(2);
    });

    test("shopCount dedupes a shop listing the same item twice, while orders keeps both", () => {
        const items = buildItems(
            snapshot([machine(1, [order({ costPerItem: 100 }), order({ costPerItem: 200 })])]),
            EMPTY_FILTERS,
            "shops",
            null,
        );
        expect(items[0]!.shopCount).toBe(1);
        expect(items[0]!.orders).toHaveLength(2);
        expect(machineIds(items[0]!)).toEqual([1]);
    });

    test("totalStock sums across shops and ignores negatives", () => {
        const items = buildItems(
            snapshot([machine(1, [order({ amountInStock: 5 })]), machine(2, [order({ amountInStock: 7 })])]),
            EMPTY_FILTERS,
            "shops",
            null,
        );
        expect(items[0]!.totalStock).toBe(12);
    });

    test("orders lead with the cheapest per unit, and sold-out listings sink to the bottom", () => {
        const items = buildItems(
            snapshot([machine(1, [
                order({ costPerItem: 300 }),
                order({ costPerItem: 10, amountInStock: 0 }),
                order({ costPerItem: 400, quantity: 4 }),
            ])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        expect(items[0]!.orders.map(o => o.costPerItem)).toEqual([400, 300, 10]);
    });
});

describe("buildItems - prices", () => {
    test("one entry per currency, each the cheapest per unit in that currency", () => {
        const items = buildItems(
            snapshot([machine(1, [
                order({ costPerItem: 1000, quantity: 20 }),
                order({ costPerItem: 250 }),
                order({ costPerItem: 900, currencyId: 3, currencyName: "Cloth", currencyShortName: "cloth" }),
            ])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        const prices = items[0]!.prices;
        expect(prices).toHaveLength(2);
        // Scrap leads: two listings against Cloth's one.
        expect(prices[0]).toMatchObject({ currencyName: "Scrap", unitPrice: 50, listings: 2 });
        expect(prices[1]).toMatchObject({ currencyName: "Cloth", unitPrice: 900, listings: 1 });
    });

    test("a sold-out listing can't advertise a price nobody can pay", () => {
        const items = buildItems(
            snapshot([machine(1, [order({ costPerItem: 10, amountInStock: 0 }), order({ costPerItem: 250 })])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        expect(items[0]!.prices).toHaveLength(1);
        expect(items[0]!.prices[0]!.unitPrice).toBe(250);
        expect(isSoldOut(items[0]!)).toBe(false);
    });

    test("an item with nothing in stock still shows what it went for, and reads as sold out", () => {
        const items = buildItems(
            snapshot([machine(1, [order({ costPerItem: 250, amountInStock: 0 })])]),
            EMPTY_FILTERS,
            "name",
            null,
        );
        expect(items).toHaveLength(1);
        expect(isSoldOut(items[0]!)).toBe(true);
        expect(items[0]!.prices[0]!.unitPrice).toBe(250);
    });
});

describe("buildItems - sorting", () => {
    const market = snapshot([
        machine(1, [order({ costPerItem: 500 }), order({ ...cloth, costPerItem: 5, amountInStock: 100 })]),
        machine(2, [order({ ...cloth, costPerItem: 8, amountInStock: 100 })], { x: 3000, y: 3000 }),
        machine(3, [order({ ...cloth, costPerItem: 6, amountInStock: 100 })], { x: 200, y: 200 }),
    ]);

    test("shops ranks the most widely sold item first", () => {
        expect(buildItems(market, EMPTY_FILTERS, "shops", null).map(i => i.name)).toEqual(["Cloth", "Rifle Body"]);
    });

    test("cheapest ranks on the leading currency's per-unit price", () => {
        expect(buildItems(market, EMPTY_FILTERS, "cheapest", null).map(i => i.name)).toEqual(["Cloth", "Rifle Body"]);
    });

    test("cheapest sinks an item with nothing in stock rather than treating it as free", () => {
        const withSoldOut = snapshot([machine(1, [
            order({ costPerItem: 500 }),
            order({ ...cloth, costPerItem: 1, amountInStock: 0 }),
        ])]);
        expect(buildItems(withSoldOut, EMPTY_FILTERS, "cheapest", null).map(i => i.name))
            .toEqual(["Rifle Body", "Cloth"]);
    });

    test("stock ranks on total units available", () => {
        expect(buildItems(market, EMPTY_FILTERS, "stock", null)[0]!.name).toBe("Cloth");
    });

    test("nearest measures to the closest shop actually stocking it", () => {
        const far = snapshot([
            machine(1, [order()], { x: 3000, y: 3000 }),
            machine(2, [order({ ...cloth })], { x: 100, y: 100 }),
        ]);
        expect(buildItems(far, EMPTY_FILTERS, "nearest", { x: 0, y: 0 }).map(i => i.name))
            .toEqual(["Cloth", "Rifle Body"]);
    });

    test("a shop that's out of stock doesn't make the item look close by", () => {
        const items = buildItems(
            snapshot([
                machine(1, [order({ amountInStock: 0 })], { x: 10, y: 10 }),
                machine(2, [order()], { x: 1000, y: 0 }),
            ]),
            EMPTY_FILTERS,
            "nearest",
            { x: 0, y: 0 },
        );
        expect(items[0]!.nearest).toBe(1000);
    });

    test("nearest is stable when there's no origin to measure from", () => {
        expect(buildItems(market, EMPTY_FILTERS, "nearest", null)).toHaveLength(2);
    });

    test("name sorts alphabetically", () => {
        expect(buildItems(market, EMPTY_FILTERS, "name", null).map(i => i.name)).toEqual(["Cloth", "Rifle Body"]);
    });
});

describe("buildItems - filters", () => {
    // The grid filter reads the *order's* grid, so it's set there rather than on the machine.
    const market = snapshot([
        machine(1, [order({ costPerItem: 100, grid: "K14" })]),
        machine(2, [order({ ...cloth, costPerItem: 900, grid: "B7" }), order({ costPerItem: 800, grid: "B7" })]),
    ]);

    test("a text query drops items that stop matching entirely", () => {
        const items = buildItems(market, { ...EMPTY_FILTERS, query: "cloth" }, "name", null);
        expect(items.map(i => i.name)).toEqual(["Cloth"]);
    });

    test("the buy side matches the currency, so cards become what that currency buys", () => {
        const items = buildItems(market, { ...EMPTY_FILTERS, query: "scrap", side: "buy" }, "name", null);
        expect(items.map(i => i.name)).toEqual(["Cloth", "Rifle Body"]);
        expect(buildItems(market, { ...EMPTY_FILTERS, query: "scrap", side: "sell" }, "name", null)).toHaveLength(0);
    });

    test("max price is applied per unit and can empty a card out of existence", () => {
        const items = buildItems(market, { ...EMPTY_FILTERS, maxPrice: 500 }, "name", null);
        expect(items.map(i => i.name)).toEqual(["Rifle Body"]);
        expect(items[0]!.orders).toHaveLength(1);
        expect(items[0]!.shopCount).toBe(1);
    });

    test("the grid filter narrows to one part of the map", () => {
        const items = buildItems(market, { ...EMPTY_FILTERS, grid: "B" }, "name", null);
        expect(items.map(i => i.name)).toEqual(["Cloth", "Rifle Body"]);
        expect(items.every(i => i.shopCount === 1)).toBe(true);
    });

    test("in-stock-only removes an item whose every listing is sold out", () => {
        const soldOut = snapshot([machine(1, [order({ amountInStock: 0 })])]);
        expect(buildItems(soldOut, EMPTY_FILTERS, "name", null)).toHaveLength(1);
        expect(buildItems(soldOut, { ...EMPTY_FILTERS, inStockOnly: true }, "name", null)).toHaveLength(0);
    });
});
