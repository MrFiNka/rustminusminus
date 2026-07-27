import type { LiveMarker } from "../../pages/serverDetail.types";

/** The toggleable layers of the map. Persisted per user (localStorage), so someone who only cares
 *  about vending pins isn't fighting cargo/heli clutter on every page load. */
export type MapLayerId = "grid" | "monuments" | "team" | "events" | "vending" | "players" | "notes";

export interface MapLayer {
    id: MapLayerId;
    label: string;
    /** Whether the layer is on for a user who has never touched the toggles. */
    defaultOn: boolean;
    /** True when this layer needs the live socket, so it can be hidden on a non-active server. */
    live: boolean;
}

export const MAP_LAYERS: MapLayer[] = [
    { id: "grid", label: "Grid", defaultOn: true, live: false },
    { id: "monuments", label: "Monuments", defaultOn: true, live: false },
    { id: "team", label: "Team", defaultOn: true, live: true },
    { id: "events", label: "Events", defaultOn: true, live: true },
    { id: "vending", label: "Vending", defaultOn: true, live: true },
    { id: "players", label: "Players", defaultOn: false, live: true },
    { id: "notes", label: "Map notes", defaultOn: false, live: true },
];

export interface MarkerStyle {
    /** Which toggleable layer this marker belongs to. */
    layer: MapLayerId;
    label: string;
    fill: string;
    /** Pin radius in screen pixels - kept constant under zoom so pins stay clickable when zoomed out. */
    radius: number;
}

/**
 * Marker type -> how it draws.
 *
 * Keyed on the `typeName` the server resolves from `AppMarkerType`, and the event labels are the
 * same strings the `map-events` module puts in its Discord alerts - so "🚢 Cargo Ship has spawned"
 * in Discord and the pin you then look for on the map say the same thing.
 */
export const MARKER_STYLES: Record<string, MarkerStyle> = {
    CargoShip: { layer: "events", label: "Cargo Ship", fill: "#3498db", radius: 7 },
    PatrolHelicopter: { layer: "events", label: "Patrol Helicopter", fill: "#e67e22", radius: 7 },
    CH47: { layer: "events", label: "Chinook", fill: "#e67e22", radius: 7 },
    Crate: { layer: "events", label: "Locked Crate", fill: "#f1c40f", radius: 6 },
    Explosion: { layer: "events", label: "Explosion", fill: "#ed4245", radius: 6 },
    VendingMachine: { layer: "vending", label: "Vending Machine", fill: "#22c55e", radius: 5 },
    Player: { layer: "players", label: "Player", fill: "#a78bfa", radius: 4 },
};

/** How a marker should draw, or null if it's a type the map doesn't show. */
export function markerStyle(marker: LiveMarker): MarkerStyle | null {
    return MARKER_STYLES[marker.typeName] ?? null;
}

const STORAGE_PREFIX = "rmm.mapLayers";

/** localStorage key for one team+server's layer toggles. Scoped per server because which layers
 *  matter differs between a server you trade on and one you raid on. */
export function layerStorageKey(guildId: string, teamId: string, serverId: string): string {
    return `${STORAGE_PREFIX}:${guildId}:${teamId}:${serverId}`;
}

export function defaultLayers(): Record<MapLayerId, boolean> {
    return Object.fromEntries(MAP_LAYERS.map(l => [l.id, l.defaultOn])) as Record<MapLayerId, boolean>;
}

/** Reads saved toggles, falling back to defaults for anything missing - so adding a layer later
 *  doesn't leave existing users with it silently off. */
export function loadLayers(key: string): Record<MapLayerId, boolean> {
    const defaults = defaultLayers();
    if (typeof window === "undefined") return defaults;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return defaults;
        const saved = JSON.parse(raw) as Partial<Record<MapLayerId, boolean>>;
        for (const layer of MAP_LAYERS) {
            if (typeof saved[layer.id] === "boolean") defaults[layer.id] = saved[layer.id]!;
        }
        return defaults;
    } catch {
        return defaults;
    }
}

export function saveLayers(key: string, layers: Record<MapLayerId, boolean>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, JSON.stringify(layers));
    } catch { /* private mode / quota - a lost display preference isn't worth surfacing */ }
}
