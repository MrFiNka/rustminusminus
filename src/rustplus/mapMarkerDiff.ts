import { AppMarkerType, type AppMarker } from "rustminus";
import { GRID_CELL_SIZE } from "./mapProjection";

export type MapMarkerEventType =
    | "cargoShipSpawned"
    | "cargoShipDespawned"
    | "patrolHelicopterSpawned"
    | "patrolHelicopterDespawned"
    | "patrolHelicopterDowned"
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

// A patrol heli that times out flies to the edge of the map and disappears there; one that gets shot
// down goes down wherever it was hit, which is almost always well inside the map bounds. So the last
// known position relative to the map edge is what distinguishes "despawned" from "downed".
const EDGE_MARGIN = GRID_CELL_SIZE * 2;

function isNearEdge(marker: AppMarker, mapSize: number): boolean {
    return marker.x <= EDGE_MARGIN || marker.y <= EDGE_MARGIN
        || marker.x >= mapSize - EDGE_MARGIN || marker.y >= mapSize - EDGE_MARGIN;
}

/**
 * Diffs two `getMapMarkers()` snapshots (keyed by marker id) into spawn/despawn events for the
 * marker types this bot cares about (cargo ship, patrol heli, chinook, crate, explosion).
 *
 * `previous` is `undefined` on the very first poll after a connection is established - that case
 * intentionally returns no events, since every marker already on the map at connect time isn't a
 * new spawn worth alerting on. It only exists to seed the baseline for the next poll.
 *
 * `mapSize` (`AppInfo.mapSize`, NOT the rendered map image's pixel dimensions) is only used to tell
 * a patrol heli's edge-of-map despawn apart from getting shot down - see `isNearEdge`.
 */
export function diffMapMarkers(previous: AppMarker[] | undefined, current: AppMarker[], mapSize: number): MapMarkerEvent[] {
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
        if (!tracked?.despawned || currentById.has(marker.id)) continue;
        const downed = marker.type === AppMarkerType.PatrolHelicopter && !isNearEdge(marker, mapSize);
        events.push({ type: downed ? "patrolHelicopterDowned" : tracked.despawned, marker });
    }
    return events;
}
