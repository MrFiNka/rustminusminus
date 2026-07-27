import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import {
    gridCellCentre,
    gridOverlay,
    pixelToWorld,
    worldToPixel,
    type MapGeometry,
} from "../../../rustplus/mapProjection";
import { toGridReference } from "../../../rustplus/gridReference";
import type {
    LiveMapNote,
    LiveMarker,
    LiveTeamInfo,
    MapMeta,
    VendingMachine,
} from "../../pages/serverDetail.types";
import type { MarkerTrail } from "../../pages/useLiveMarkers";
import { MAP_LAYERS, layerStorageKey, loadLayers, markerStyle, saveLayers, type MapLayerId } from "./layers";
import { useMapView } from "./useMapView";
import { MarkerPopover, type MapSelection } from "./MarkerPopover";

/** What outside code can tell the map to do. */
export interface MapControls {
    /** Centre on a vending machine and open its stock popover. */
    focusMachine: (machineId: number) => void;
}

export interface ServerMapProps {
    guildId: string;
    teamId: string;
    serverId: string;
    meta: MapMeta;
    markers: LiveMarker[];
    teamInfo: LiveTeamInfo | null;
    trails: MarkerTrail[];
    /** Machines by id, for the vending popover - the map borrows the market panel's loaded data
     *  rather than fetching stock a second time. */
    machines: Map<number, VendingMachine>;
    /** Machines the market panel is hovering, highlighted here. A set rather than one id because an
     *  item is sold by several shops, and hovering it should ring all of them. */
    highlightedMachineIds: ReadonlySet<number>;
    /** Fired when a pin is clicked, so the market list can filter to that machine. */
    onSelectMachine: (machineId: number | null) => void;
    /** Filled in by the map with its imperative commands, so the market list can centre the map from
     *  a click handler. A command, expressed as one - rather than a prop change plus an effect. */
    controlsRef?: React.MutableRefObject<MapControls | null>;
    /** True when live layers can't arrive (non-active server) - they're hidden and explained. */
    liveUnavailable: boolean;
}

/** Normalised map space (0..1) for a world position - what the view transform works in. */
function toUnit(x: number, y: number, geometry: MapGeometry) {
    const { px, py } = worldToPixel({ x, y }, geometry);
    return { u: px / geometry.imageWidth, v: py / geometry.imageHeight };
}

const controlClass =
    "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/90 text-neutral-300 backdrop-blur transition-colors hover:border-accent hover:text-white";

/**
 * Half as tall as it is wide, where the map used to be square - the full-card-width square was
 * taller than most windows. The map keeps its own aspect and is fitted to the viewport's *width*
 * (see useMapView), so this crops it vertically to a band and pans to reach the rest, rather than
 * squashing it or shrinking it in both directions.
 */
const viewportClass =
    "relative aspect-[2/1] w-full select-none overflow-hidden rounded-lg border border-border bg-canvas";

export function ServerMap({
    guildId,
    teamId,
    serverId,
    meta,
    markers,
    teamInfo,
    trails,
    machines,
    highlightedMachineIds,
    onSelectMachine,
    controlsRef,
    liveUnavailable,
}: ServerMapProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const view = useMapView(viewportRef, meta.width / meta.height);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [cursorGrid, setCursorGrid] = useState<string | null>(null);
    const [selection, setSelection] = useState<MapSelection | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    // Toggles are stored per team+server, so the held state is tagged with the key it was loaded
    // for. Switching servers is then handled at render (below) rather than by a setState in an
    // effect, which would cost a cascading re-render on every navigation.
    const storageKey = layerStorageKey(guildId, teamId, serverId);
    const [layerState, setLayerState] = useState(() => ({ key: storageKey, layers: loadLayers(storageKey) }));
    const layers = layerState.key === storageKey ? layerState.layers : loadLayers(storageKey);

    const toggleLayer = (id: MapLayerId) => {
        const next = { ...layers, [id]: !layers[id] };
        saveLayers(storageKey, next);
        setLayerState({ key: storageKey, layers: next });
    };

    /**
     * The projection is built from the *reported* image size. Everything downstream works in
     * normalised 0..1 space, so a mismatch between reported and natural pixel dimensions cancels out
     * - which is why the overlay never needs the loaded bitmap's own size.
     */
    const geometry: MapGeometry = useMemo(() => ({
        mapSize: meta.mapSize,
        imageWidth: meta.width,
        imageHeight: meta.height,
        oceanMargin: meta.oceanMargin,
    }), [meta]);

    const overlay = useMemo(() => gridOverlay(geometry), [geometry]);

    // Static overlay (grid + monument dots) on a canvas: it's hundreds of lines and labels that
    // never change, so drawing it once per size/zoom change beats hundreds of SVG nodes in the tree.
    useEffect(() => {
        const canvas = canvasRef.current;
        const { width, height } = view.viewport;
        if (!canvas || width === 0 || height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // The canvas is the viewport (it clips), but positions are normalised over the *content*,
        // which is fitted to the viewport's width and so may be taller than it.
        const sx = (u: number) => u * view.content.width * view.scale + view.tx;
        const sy = (v: number) => v * view.content.height * view.scale + view.ty;

        if (layers.grid) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.16)";
            ctx.beginPath();
            for (const line of overlay.columns) {
                const x = sx(line.offset / geometry.imageWidth);
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (const line of overlay.rows) {
                const y = sy(line.offset / geometry.imageHeight);
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
            }
            ctx.stroke();

            // Labels pinned to the viewport edges rather than the map, so they stay readable while
            // panning - the same behaviour the in-game F1 map has.
            ctx.font = "10px ui-monospace, monospace";
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            ctx.textBaseline = "top";
            const cellPx = overlay.columns.length > 1
                ? (overlay.columns[1]!.offset - overlay.columns[0]!.offset) / geometry.imageWidth * view.content.width * view.scale
                : 0;
            // Skip labels once cells get too small to read - drawing them anyway just makes mush.
            if (cellPx > 14) {
                for (const line of overlay.columns) {
                    if (!line.label) continue;
                    const x = sx(line.offset / geometry.imageWidth) + cellPx / 2;
                    if (x < 0 || x > width) continue;
                    ctx.textAlign = "center";
                    ctx.fillText(line.label, x, 2);
                }
                for (const line of overlay.rows) {
                    if (!line.label) continue;
                    const y = sy(line.offset / geometry.imageHeight) + cellPx / 2;
                    if (y < 0 || y > height) continue;
                    ctx.textAlign = "left";
                    ctx.fillText(line.label, 3, y - 5);
                }
            }
        }

        if (layers.monuments) {
            ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            for (const monument of meta.monuments) {
                const { u, v } = toUnit(monument.x, monument.y, geometry);
                const x = sx(u);
                const y = sy(v);
                if (x < -40 || x > width + 40 || y < -20 || y > height + 20) continue;
                ctx.fillStyle = "rgba(255,255,255,0.75)";
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fill();
                // Below 1.6x the map is dense enough that every label would overlap its neighbours.
                if (view.scale >= 1.6) {
                    ctx.fillStyle = "rgba(0,0,0,0.65)";
                    const text = monument.label;
                    const w = ctx.measureText(text).width;
                    ctx.fillRect(x - w / 2 - 3, y - 17, w + 6, 13);
                    ctx.fillStyle = "rgba(255,255,255,0.92)";
                    ctx.fillText(text, x, y - 5);
                }
            }
        }
    }, [geometry, layers.grid, layers.monuments, meta.monuments, overlay, view.content.height, view.content.width, view.scale, view.tx, view.ty, view.viewport]);

    const onMouseMove = useCallback((event: React.MouseEvent) => {
        const point = view.toMapSpace(event.clientX, event.clientY);
        if (!point) return setCursorGrid(null);
        const world = pixelToWorld(
            { px: point.u * geometry.imageWidth, py: point.v * geometry.imageHeight },
            geometry,
        );
        setCursorGrid(toGridReference(world.x, world.y, geometry.mapSize));
    }, [geometry, view]);

    /** Copies a grid reference on right-click, so a spot can be pasted into chat or Discord. */
    const onContextMenu = useCallback((event: React.MouseEvent) => {
        const point = view.toMapSpace(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault();
        const world = pixelToWorld(
            { px: point.u * geometry.imageWidth, py: point.v * geometry.imageHeight },
            geometry,
        );
        const grid = toGridReference(world.x, world.y, geometry.mapSize);
        void navigator.clipboard?.writeText(grid).then(() => {
            setCopied(grid);
            setTimeout(() => setCopied(null), 1500);
        }, () => { /* clipboard blocked - not worth an error banner */ });
    }, [geometry, view]);

    const visibleMarkers = useMemo(
        () => markers
            .map(marker => ({ marker, style: markerStyle(marker) }))
            .filter((m): m is { marker: LiveMarker; style: NonNullable<ReturnType<typeof markerStyle>> } =>
                !!m.style && layers[m.style.layer]),
        [markers, layers],
    );

    const notes: LiveMapNote[] = useMemo(
        () => (layers.notes && teamInfo ? [...teamInfo.mapNotes, ...teamInfo.leaderMapNotes] : []),
        [layers.notes, teamInfo],
    );

    const { width: vw, height: vh } = view.viewport;
    const sx = (u: number) => u * view.content.width * view.scale + view.tx;
    const sy = (v: number) => v * view.content.height * view.scale + view.ty;

    // Clicking a market row centres the map on that shop and opens its stock - the other half of the
    // list<->map coupling. Published as a command the list calls from its click handler, so there's
    // no prop-change-plus-effect round trip and repeat clicks on the same row just work.
    const focusMachine = useCallback((machineId: number) => {
        const machine = machines.get(machineId);
        if (!machine) return;
        const { u, v } = toUnit(machine.x, machine.y, geometry);
        view.flyTo(u, v, 4);
        const marker = markers.find(m => m.id === machineId);
        const style = marker ? markerStyle(marker) : null;
        if (marker && style) setSelection({ marker, style });
    }, [geometry, machines, markers, view]);

    useEffect(() => {
        if (!controlsRef) return;
        controlsRef.current = { focusMachine };
        return () => { controlsRef.current = null; };
    }, [controlsRef, focusMachine]);

    // Deep link: ?focus=<grid> or ?marker=<id> centres the map on load, so a Discord alert's grid
    // reference can become a link straight to the spot.
    const focused = useRef(false);
    useEffect(() => {
        if (focused.current || vw === 0) return;
        const params = new URLSearchParams(window.location.search);
        const markerId = params.get("marker");
        const focus = params.get("focus");
        if (markerId) {
            const marker = markers.find(m => String(m.id) === markerId);
            if (marker) {
                const { u, v } = toUnit(marker.x, marker.y, geometry);
                view.flyTo(u, v, 4);
                focused.current = true;
            }
            return;
        }
        if (focus) {
            const target = gridCellCentre(focus, geometry.mapSize);
            if (target) {
                const { u, v } = toUnit(target.x, target.y, geometry);
                view.flyTo(u, v, 4);
                focused.current = true;
            }
        }
    }, [geometry, markers, view, vw]);

    return (
        <div className="flex flex-col gap-2 p-3">
            <div
                ref={viewportRef}
                onMouseMove={onMouseMove}
                onMouseLeave={() => setCursorGrid(null)}
                onContextMenu={onContextMenu}
                className={`${viewportClass} ${view.isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            >
                <img
                    src={`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`}
                    alt="Server map"
                    draggable={false}
                    style={{
                        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                        transformOrigin: "0 0",
                        // Height from the map's own aspect rather than the measured content size, so
                        // the image lays out correctly on the first paint, before the ResizeObserver
                        // has reported anything. Width is 100% - content is fitted to the viewport.
                        aspectRatio: `${meta.width} / ${meta.height}`,
                    }}
                    className="absolute left-0 top-0 w-full"
                />

                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

                {vw > 0 && (
                    <svg className="pointer-events-none absolute inset-0 h-full w-full" width={vw} height={vh}>
                        {/* Movement trails first, so pins draw over them. */}
                        {layers.events && trails.map((trail) => {
                            const points = trail.points.map((p) => {
                                const { u, v } = toUnit(p.x, p.y, geometry);
                                return `${sx(u)},${sy(v)}`;
                            }).join(" ");
                            return (
                                <polyline
                                    key={`trail-${trail.markerId}`}
                                    points={points}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.35)"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 3"
                                />
                            );
                        })}

                        {notes.map((note, i) => {
                            const { u, v } = toUnit(note.x, note.y, geometry);
                            return (
                                <rect
                                    key={`note-${i}`}
                                    x={sx(u) - 3}
                                    y={sy(v) - 3}
                                    width={6}
                                    height={6}
                                    fill="#fbbf24"
                                    opacity={0.85}
                                />
                            );
                        })}

                        {layers.team && teamInfo?.members.map((member) => {
                            const { u, v } = toUnit(member.x, member.y, geometry);
                            return (
                                <g key={member.steamId} opacity={member.isOnline ? 1 : 0.4}>
                                    <circle
                                        cx={sx(u)}
                                        cy={sy(v)}
                                        r={5}
                                        fill={member.isAlive ? "#38bdf8" : "#6b7280"}
                                        stroke="#0b0b0b"
                                        strokeWidth={1.5}
                                    />
                                    {view.scale >= 2 && (
                                        <text
                                            x={sx(u)}
                                            y={sy(v) - 9}
                                            textAnchor="middle"
                                            fontSize={10}
                                            fill="rgba(255,255,255,0.9)"
                                        >
                                            {member.name}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {visibleMarkers.map(({ marker, style }) => {
                            const { u, v } = toUnit(marker.x, marker.y, geometry);
                            const isVending = style.layer === "vending";
                            const highlighted = isVending && highlightedMachineIds.has(marker.id);
                            return (
                                <circle
                                    key={marker.id}
                                    data-map-interactive
                                    cx={sx(u)}
                                    cy={sy(v)}
                                    r={highlighted ? style.radius + 3 : style.radius}
                                    fill={style.fill}
                                    fillOpacity={marker.outOfStock ? 0.35 : 0.9}
                                    stroke={highlighted ? "#ffffff" : "#0b0b0b"}
                                    strokeWidth={highlighted ? 2 : 1.25}
                                    className="pointer-events-auto cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelection({ marker, style });
                                        if (isVending) onSelectMachine(marker.id);
                                    }}
                                />
                            );
                        })}
                    </svg>
                )}

                <div className="absolute right-2 top-2 flex flex-col gap-1">
                    <button data-map-interactive onClick={() => view.zoomBy(1.4)} className={controlClass} title="Zoom in">
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button data-map-interactive onClick={() => view.zoomBy(1 / 1.4)} className={controlClass} title="Zoom out">
                        <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button data-map-interactive onClick={view.reset} className={controlClass} title="Reset view">
                        <Crosshair className="h-3.5 w-3.5" />
                    </button>
                </div>

                {(cursorGrid || copied) && (
                    <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-neutral-200 backdrop-blur">
                        {copied ? `Copied ${copied}` : cursorGrid}
                    </div>
                )}

                {selection && (
                    <MarkerPopover
                        selection={selection}
                        machine={machines.get(selection.marker.id) ?? null}
                        grid={toGridReference(selection.marker.x, selection.marker.y, geometry.mapSize)}
                        onClose={() => setSelection(null)}
                    />
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {MAP_LAYERS.filter(layer => !(layer.live && liveUnavailable)).map((layer) => (
                    <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                            layers[layer.id]
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : "border-border text-neutral-500 hover:text-neutral-300"
                        }`}
                    >
                        {layer.label}
                    </button>
                ))}
                {liveUnavailable && (
                    <span className="ml-auto text-xs text-neutral-500">
                        Live layers need the active server&apos;s connection — showing the static map.
                    </span>
                )}
            </div>
        </div>
    );
}
