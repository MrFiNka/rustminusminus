import { describe, expect, test } from "bun:test";
import { formatOrder } from "./format";
import type { VendingOrder } from "./types";

function order(overrides: Partial<VendingOrder> = {}): VendingOrder {
    return {
        machineId: 1,
        x: 1500,
        y: 2000,
        grid: "K14",
        itemId: 1364514366,
        itemName: "Rifle Body",
        itemShortName: "riflebody",
        quantity: 1,
        costPerItem: 250,
        currencyId: -932201673,
        currencyName: "Scrap",
        currencyShortName: "scrap",
        amountInStock: 3,
        itemIsBlueprint: false,
        currencyIsBlueprint: false,
        ...overrides,
    };
}

describe("formatOrder", () => {
    /**
     * This is the regression guard for the records refactor: the in-game !market and Discord /market
     * output has to be byte-identical to the string search.ts used to build inline, em dash included.
     */
    test("reproduces the pre-refactor chat line exactly", () => {
        expect(formatOrder(order())).toBe("Rifle Body x1 for 250 Scrap — K14 (3 in stock)");
    });

    test("carries quantity, price, currency, grid and stock through", () => {
        expect(formatOrder(order({
            itemName: "Sheet Metal Door",
            quantity: 2,
            costPerItem: 90,
            currencyName: "Cloth",
            grid: "B7",
            amountInStock: 41,
        }))).toBe("Sheet Metal Door x2 for 90 Cloth — B7 (41 in stock)");
    });
});
