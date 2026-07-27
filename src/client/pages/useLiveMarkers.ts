import { useState } from "react";
import type { LiveMarker, LiveTeamInfo } from "./serverDetail.types";
import { useLiveSocket } from "./useLiveSocket";

/** How many past positions to keep per moving marker. At the server's 30s push interval this is
 *  roughly the last five minutes of travel - enough to read a heading, short enough to stay honest
 *  about where something is *now*. */
const TRAIL_LENGTH = 10;

/** Marker types worth trailing: the things that move across the map on a route. Crates and
 *  explosions are static, and vending machines never move, so trailing them would be noise. */
const TRAILED_TYPES = new Set(["CargoShip", "PatrolHelicopter", "CH47"]);

export interface MarkerTrail {
    markerId: number;
    typeName: string;
    /** Oldest first, so the renderer can fade from the tail toward the current position. */
    points: { x: number; y: number }[];
}

export interface LiveMapState {
    markers: LiveMarker[];
    /** Epoch ms of the server-side marker fetch, for the "updated Ns ago" readout. Null before the
     *  first frame. */
    fetchedAt: number | null;
    teamInfo: LiveTeamInfo | null;
    trails: MarkerTrail[];
}

// Stable empty identities, so an idle map doesn't hand its consumers a new array every render.
const NO_MARKERS: LiveMarker[] = [];
const NO_TRAILS: MarkerTrail[] = [];

/**
 * The map's live layers: markers and teammate positions from the `/ws` socket, plus client-side
 * movement trails for cargo/heli/chinook.
 *
 * Trails are accumulated here rather than server-side because the polling already happens for the
 * marker layer - keeping the last N positions in the browser costs nothing and is per-viewer state
 * anyway. A thin selector over {@link useLiveSocket}, which owns the connection.
 *
 * `enabled` should be the page's `isActive` - only the active server has a live connection to push.
 */
export function useLiveMarkers(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    enabled: boolean,
): LiveMapState {
    const { markers, teamInfo } = useLiveSocket(guildId, teamId, serverId, enabled);

    // Tagged with the target it belongs to, so a change of server (or going inactive) drops the
    // accumulated history at render rather than needing an effect to clear it - otherwise a trail
    // from the previous server would be drawn over the new one's map.
    const targetKey = `${guildId}:${teamId}:${serverId}:${enabled}`;
    const [history, setHistory] = useState<{ key: string; fetchedAt: number | null; trails: MarkerTrail[] }>(
        { key: targetKey, fetchedAt: null, trails: NO_TRAILS },
    );

    const fetchedAt = markers?.fetchedAt ?? null;

    // Adjusted during render rather than in an effect: this is state derived from the frame we were
    // just handed, and React's documented "adjust state when props change" pattern re-renders
    // immediately with the right value instead of painting one frame with a stale trail. Guarded on
    // `fetchedAt` so a re-render for any other reason never appends a duplicate point.
    if (markers && (history.key !== targetKey || history.fetchedAt !== markers.fetchedAt)) {
        const previous = history.key === targetKey ? history.trails : NO_TRAILS;
        setHistory({ key: targetKey, fetchedAt: markers.fetchedAt, trails: extendTrails(previous, markers.markers) });
    }

    return {
        markers: markers?.markers ?? NO_MARKERS,
        fetchedAt,
        teamInfo,
        // Held state that belongs to a previous target reports empty until the new one delivers.
        trails: history.key === targetKey ? history.trails : NO_TRAILS,
    };
}

/** Appends the current positions of trailed markers, dropping despawned ones - a cargo ship that
 *  left shouldn't leave a ghost path behind it. Pure, so it's safe to call from the state updater. */
function extendTrails(previous: MarkerTrail[], markers: LiveMarker[]): MarkerTrail[] {
    const byId = new Map(previous.map(t => [t.markerId, t]));
    const next: MarkerTrail[] = [];

    for (const marker of markers) {
        if (!TRAILED_TYPES.has(marker.typeName)) continue;
        const existing = byId.get(marker.id);
        if (!existing) {
            next.push({ markerId: marker.id, typeName: marker.typeName, points: [{ x: marker.x, y: marker.y }] });
            continue;
        }
        const last = existing.points.at(-1);
        // Skip stationary repeats, so a parked heli doesn't burn the whole buffer on one point.
        if (last && last.x === marker.x && last.y === marker.y) {
            next.push(existing);
            continue;
        }
        next.push({
            ...existing,
            points: [...existing.points, { x: marker.x, y: marker.y }].slice(-TRAIL_LENGTH),
        });
    }

    return next;
}
