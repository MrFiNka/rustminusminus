import { AppMarkerType, type AppMarker } from "rustminus";

export type MapMarkerEventType =
    | "cargoShipSpawned"
    | "cargoShipDespawned"
    | "patrolHelicopterSpawned"
    | "patrolHelicopterDespawned"
    | "ch47Spawned"
    | "ch47Despawned"
    | "crateSpawned"
    | "crateDespawned"
    | "explosionSpawned";

export interface MapMarkerEvent {
    type: MapMarkerEventType;
    marker: AppMarker;
}

const TRACKED_TYPES: Partial<Record<AppMarkerType, { spawned: MapMarkerEventType; despawned?: MapMarkerEventType }>> = {
    [AppMarkerType.CargoShip]: { spawned: "cargoShipSpawned", despawned: "cargoShipDespawned" },
    [AppMarkerType.PatrolHelicopter]: { spawned: "patrolHelicopterSpawned", despawned: "patrolHelicopterDespawned" },
    [AppMarkerType.CH47]: { spawned: "ch47Spawned", despawned: "ch47Despawned" },
    [AppMarkerType.Crate]: { spawned: "crateSpawned", despawned: "crateDespawned" },
    // explosions are transient (gone by the next poll almost always) - spawn-only is sufficient
    [AppMarkerType.Explosion]: { spawned: "explosionSpawned" },
};

/**
 * Diffs two `getMapMarkers()` snapshots (keyed by marker id) into spawn/despawn events for the
 * marker types this bot cares about (cargo ship, patrol heli, chinook, crate, explosion).
 *
 * `previous` is `undefined` on the very first poll after a connection is established - that case
 * intentionally returns no events, since every marker already on the map at connect time isn't a
 * new spawn worth alerting on. It only exists to seed the baseline for the next poll.
 */
export function diffMapMarkers(previous: AppMarker[] | undefined, current: AppMarker[]): MapMarkerEvent[] {
    if (previous === undefined) return [];

    const events: MapMarkerEvent[] = [];
    const previousById = new Map(previous.map(m => [m.id, m]));
    const currentById = new Map(current.map(m => [m.id, m]));

    for (const marker of current) {
        const tracked = TRACKED_TYPES[marker.type];
        if (tracked && !previousById.has(marker.id)) events.push({ type: tracked.spawned, marker });
    }
    for (const marker of previous) {
        const tracked = TRACKED_TYPES[marker.type];
        if (tracked?.despawned && !currentById.has(marker.id)) events.push({ type: tracked.despawned, marker });
    }
    return events;
}
