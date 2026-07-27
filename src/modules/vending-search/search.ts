import type { RustPlus } from "rustminus";
import { AppMarkerType } from "rustminus";
import { getItemCatalog } from "../../rustplus/itemCatalog";
import { toGridReference } from "../../rustplus/gridReference";

export async function searchVendingMachines(rustplus: RustPlus, query: string): Promise<string[]> {
    const catalog = await getItemCatalog();
    const needle = query.toLowerCase();
    const matchingIds = new Set(
        [...catalog.entries()]
            .filter(([, def]) => def.name.toLowerCase().includes(needle) || def.shortName.toLowerCase().includes(needle))
            .map(([id]) => id),
    );
    if (matchingIds.size === 0) return [];

    const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
    const results: string[] = [];
    for (const marker of markers) {
        if (marker.type !== AppMarkerType.VendingMachine) continue;
        for (const order of marker.sellOrders) {
            if (!matchingIds.has(order.itemId) || order.amountInStock <= 0) continue;
            const itemName = catalog.get(order.itemId)?.name ?? `item ${order.itemId}`;
            const currencyName = catalog.get(order.currencyId)?.name ?? `item ${order.currencyId}`;
            const grid = toGridReference(marker.x, marker.y, info.mapSize);
            results.push(`${itemName} x${order.quantity} for ${order.costPerItem} ${currencyName} — ${grid} (${order.amountInStock} in stock)`);
        }
    }
    return results;
}
