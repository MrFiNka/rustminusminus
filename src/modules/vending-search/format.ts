import type { VendingOrder } from "./types";

/**
 * Renders one order as the chat/Discord line.
 *
 * Byte-for-byte what `searchVendingMachines` used to build inline (em dash included), so `!market`
 * and `/market` output is unchanged by the move to structured records. The extra fields the records
 * carry - blueprint and condition flags - are deliberately left out here: they belong in the web
 * browser, where there's room for a badge, not appended to an in-game chat line that's already
 * truncated to five results.
 */
export function formatOrder(order: VendingOrder): string {
    return `${order.itemName} x${order.quantity} for ${order.costPerItem} ${order.currencyName} — ${order.grid} (${order.amountInStock} in stock)`;
}
