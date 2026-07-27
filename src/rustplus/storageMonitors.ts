import type { AppEntityPayload, RustPlus } from "rustminus";
import { displayName } from "./pairedItems";
import { getItemCatalog } from "./itemCatalog";

export interface StorageItem {
    itemId: number;
    name: string;
    shortName: string;
    quantity: number;
    isBlueprint: boolean;
}

export type StorageEntity =
    | { id: string; name: string; kind: "cupboard"; hasProtection: boolean; protectionExpiry: number | null; capacity: number; items: StorageItem[]; unavailable?: boolean }
    | { id: string; name: string; kind: "storage"; capacity: number; items: StorageItem[]; unavailable?: boolean };

/** Shapes an already-fetched entity payload (e.g. from an `onEntityChanged` event) into a
 *  {@link StorageEntity}, without an extra Rust+ round trip - see {@link readStorageEntity} for
 *  the fetch-then-shape variant. Tool cupboards carry their contents (upkeep materials) too, so
 *  items/capacity are populated for both kinds. */
export function describeStoragePayload(
    item: { id: string; name?: string },
    payload: AppEntityPayload | undefined,
    catalog: Map<number, { name: string; shortName: string }>,
): StorageEntity {
    const name = displayName(item, "storageMonitor");
    const items: StorageItem[] = (payload?.items ?? []).map((entry) => {
        const def = catalog.get(entry.itemId);
        return {
            itemId: entry.itemId,
            name: def?.name ?? `Unknown item ${entry.itemId}`,
            shortName: def?.shortName ?? "",
            quantity: entry.quantity,
            isBlueprint: entry.itemIsBlueprint,
        };
    });
    const capacity = payload?.capacity ?? 0;
    if (payload?.hasProtection) {
        return { id: item.id, name, kind: "cupboard", hasProtection: true, protectionExpiry: payload.protectionExpiry ?? null, capacity, items };
    }
    return { id: item.id, name, kind: "storage", capacity, items };
}

/** Reads one paired storage monitor's live contents/protection state from Rust+, shared by the
 *  web dashboard's snapshot builder and the storage-monitors module. */
export async function readStorageEntity(rustplus: RustPlus, item: { id: string; name?: string }): Promise<StorageEntity> {
    const catalog = await getItemCatalog();
    const entityInfo = await rustplus.getEntityInfo(Number(item.id));
    return describeStoragePayload(item, entityInfo.payload, catalog);
}
