import { useState } from "react";
import { Link, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { ArrowLeft, Bell, Box, Clock, Hourglass, Plug, Radar, Search, Server, Shield, Store, Users, Zap } from "lucide-react";
import { GuildSubNav } from "../components/GuildSubNav";
import { Toggle } from "../components/Toggle";
import { Lightbox } from "../components/Lightbox";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { StatTile, statIconClass } from "../components/StatTile";
import { SectionCard } from "../components/SectionCard";
import { InlineRename } from "../components/InlineRename";
import type { ServerDetailResponse, ServerSnapshot, StorageEntity, StorageItem } from "./serverDetail.types";
import { relativeTime, upkeepRemaining, upkeepTier, upkeepTierClass } from "./serverDetail.utils";
import { useLiveSnapshot } from "./useLiveSnapshot";

/** Shown on a paired device Rust+ couldn't read - almost always because it was destroyed in-game
 *  or the team's active credential lost tool-cupboard auth for it. */
const ENTITY_UNAVAILABLE_HELP =
    "Couldn't reach this entity — check it's still alive in-game and that you're authorized on its tool cupboard.";

export async function loader({ params }: LoaderFunctionArgs): Promise<ServerDetailResponse> {
    const { guildId, teamId, serverId } = params;
    const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}`);
    const json = await res.json();
    if (!res.ok || typeof json.serverId !== "string") {
        throw new Response(json?.error ?? "Failed to load this server", { status: res.status });
    }
    return json;
}

/** A paired device Rust+ couldn't read - dimmed, with a why-and-how hint and an unpair button. */
function UnavailableRow({
    name,
    id,
    onRename,
    onRemove,
}: {
    name: string;
    id: string;
    onRename: (name: string) => Promise<void>;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 opacity-60">
            <div className="min-w-0">
                <InlineRename name={name} subtitle={id} onRename={onRename} />
                <p className="mt-0.5 text-xs text-neutral-500">{ENTITY_UNAVAILABLE_HELP}</p>
            </div>
            <button
                onClick={onRemove}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-neutral-400 transition-colors hover:border-red-500/50 hover:text-red-400"
            >
                Remove
            </button>
        </div>
    );
}

/** Item icons + names, shared by storage boxes and tool-cupboard contents. */
function ItemChips({ items }: { items: StorageItem[] }) {
    const groupedItems = Object.values(
        items.reduce<Record<string, StorageItem>>((acc, item) => {
            const key = `${item.shortName}-${item.isBlueprint}`;

            if (!acc[key]) {
                acc[key] = { ...item };
            } else {
                acc[key].quantity += item.quantity;
            }

            return acc;
        }, {}),
    );

    return (
        <div className="flex flex-wrap gap-2">
            {groupedItems.map((item) => (
                <div
                    key={`${item.shortName}-${item.isBlueprint}`}
                    className="flex items-center gap-1.5 rounded-md bg-surface-hover px-2 py-1"
                >
                    {item.shortName && <img src={`https://cdn.carbonmod.gg/items/${item.shortName}.png`} alt="" className="h-5 w-5" />}
                    <span className="text-xs text-neutral-200">
                        {item.name}
                        {item.isBlueprint ? " (BP)" : ""} ×{item.quantity}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * The card list shared by the tool-cupboard and storage-box sections - they render identically apart
 * from the cupboard's upkeep badge, which callers supply via `badge`. Unavailable entities fall
 * through to {@link UnavailableRow} rather than re-implementing that row inline.
 */
function StorageCardList<T extends StorageEntity>({
    entities,
    onRename,
    onRemove,
    badge,
}: {
    entities: T[];
    onRename: (kind: "storageMonitor", entityId: string, name: string) => Promise<void>;
    onRemove: (kind: "storageMonitor", entityId: string) => Promise<void>;
    badge?: (entity: T) => React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 p-3">
            {entities.map((entity) => {
                if (entity.unavailable) {
                    return (
                        <UnavailableRow
                            key={entity.id}
                            name={entity.name}
                            id={entity.id}
                            onRename={(name) => onRename("storageMonitor", entity.id, name)}
                            onRemove={() => onRemove("storageMonitor", entity.id)}
                        />
                    );
                }
                const pct = entity.capacity > 0 ? Math.min(100, (entity.items.length / entity.capacity) * 100) : 0;
                return (
                    <div key={entity.id} className="rounded-lg border border-border/60 bg-canvas/40 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                            <InlineRename
                                name={entity.name}
                                subtitle={entity.id}
                                onRename={(name) => onRename("storageMonitor", entity.id, name)}
                            />
                            <span>
                                <span className="text-xs text-neutral-500 mr-2">
                                    {entity.items.length} / {entity.capacity} slots
                                </span>
                                {badge?.(entity)}
                            </span>
                        </div>
                        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                        {entity.items.length === 0 ? (
                            <p className="text-xs text-neutral-600">Empty</p>
                        ) : (
                            <ItemChips items={entity.items} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function Component() {
    const { guildId, teamId, serverId } = useParams<{ guildId: string; teamId: string; serverId: string }>();
    const data = useLoaderData() as ServerDetailResponse;
    const revalidator = useRevalidator();
    const pushedLive = useLiveSnapshot(guildId, teamId, serverId, data.isActive);
    const [pingedLive, setPingedLive] = useState<ServerSnapshot | null>(null);
    const [pinging, setPinging] = useState(false);
    const [pingError, setPingError] = useState<string | null>(null);
    const [deviceError, setDeviceError] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
    const [vendingQuery, setVendingQuery] = useState("");
    const [vendingResults, setVendingResults] = useState<string[] | null>(null);
    const [vendingSearching, setVendingSearching] = useState(false);
    const [vendingError, setVendingError] = useState<string | null>(null);

    const ping = async () => {
        setPinging(true);
        setPingError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/ping`, { method: "POST" });
        const json = await res.json();
        setPinging(false);
        if (!res.ok) {
            setPingError(json.error ?? "Failed to connect to this server");
            return;
        }
        setPingedLive(json);
    };

    /**
     * Applies a device mutation's result to the page. On the active server the live socket already
     * pushes the resulting state (applyEntityChanged / renameLiveEntity / removeLiveEntity), so
     * re-running the loader would just repeat a full server-side snapshot for data we're about to be
     * handed anyway - only non-active servers need the refetch. Failures used to be swallowed
     * entirely; they now surface in the same banner the ping/vending errors use.
     */
    const afterDeviceMutation = async (res: Response, fallbackError: string) => {
        if (!res.ok) {
            const json = await res.json().catch(() => null);
            setDeviceError(json?.error ?? fallbackError);
            return;
        }
        setDeviceError(null);
        if (!data.isActive) revalidator.revalidate();
    };

    const toggleSwitch = async (entityId: string, value: boolean) => {
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/entities/${entityId}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        });
        await afterDeviceMutation(res, "Failed to toggle this switch");
    };

    const renameDevice = async (kind: "smartSwitch" | "smartAlarm" | "storageMonitor", entityId: string, name: string) => {
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/entities/${entityId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, name }),
        });
        await afterDeviceMutation(res, "Failed to rename this device");
    };

    const removeDevice = async (kind: "smartSwitch" | "smartAlarm" | "storageMonitor", entityId: string) => {
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/entities/${entityId}?kind=${kind}`, {
            method: "DELETE",
        });
        await afterDeviceMutation(res, "Failed to remove this device");
    };

    const searchVending = async () => {
        if (!vendingQuery.trim()) return;
        setVendingSearching(true);
        setVendingError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/vending-search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: vendingQuery.trim() }),
        });
        const json = await res.json();
        setVendingSearching(false);
        if (!res.ok) {
            setVendingError(json.error ?? "Search failed");
            setVendingResults(null);
            return;
        }
        setVendingResults(json.results);
    };

    if (!guildId || !teamId || !serverId) return null;

    // Live websocket push (active server) wins; otherwise the loader's snapshot, or a manual ping.
    const live = pushedLive ?? data.live ?? pingedLive;
    const cupboards = live?.storage.filter((s): s is Extract<StorageEntity, { kind: "cupboard" }> => s.kind === "cupboard") ?? [];
    const storageBoxes = live?.storage.filter((s): s is Extract<StorageEntity, { kind: "storage" }> => s.kind === "storage") ?? [];
    const hasModule = (moduleId: string) => data.enabledModules.includes(moduleId);

    return (
        <div className="space-y-6">
            <GuildSubNav guildId={guildId} />

            <Link
                to={`/guild/${guildId}/teams/${teamId}`}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-white"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {data.name}&apos;s team
            </Link>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5">
                {data.img ? (
                    <img
                        src={data.img}
                        alt=""
                        onClick={() => setLightbox({ src: data.img!, alt: data.name })}
                        className="h-8 w-8 shrink-0 cursor-zoom-in rounded-md border border-border object-cover opacity-80 transition-opacity hover:opacity-100"
                    />
                ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-hover text-neutral-600">
                        <Server className="h-3.5 w-3.5" />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-semibold text-white">{data.name}</h1>
                    <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-0.5 font-mono text-xs text-neutral-400">
                        {data.ip ? `${data.ip}:${data.port}` : data.serverId}
                    </p>
                </div>
                {data.isActive && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                        Active
                    </span>
                )}
            </div>

            {!live && !data.isActive && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                        <Plug className="h-4.5 w-4.5" />
                    </span>
                    <p className="flex-1 min-w-55 text-sm text-neutral-400">
                        This isn&apos;t the team&apos;s active server, so live device state isn&apos;t loaded automatically. Ping it to
                        connect for a moment and fetch the current state (read-only — switches can only be controlled on the active server).
                    </p>
                    <div>
                        <button
                            onClick={ping}
                            disabled={pinging}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                            {pinging ? "Connecting…" : "Ping server"}
                        </button>
                        {pingError && <p className="mt-2 text-xs text-red-400">{pingError}</p>}
                    </div>
                </div>
            )}

            {data.liveError && !live && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">{data.liveError}</div>
            )}

            {deviceError && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">{deviceError}</div>
            )}

            {live && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap divide-y divide-border rounded-xl border border-border bg-surface sm:divide-y-0 sm:divide-x">
                        <StatTile
                            icon={
                                <span className={statIconClass}>
                                    <Users className="h-4 w-4" />
                                </span>
                            }
                            label="Players"
                            value={`${live.players}/${live.maxPlayers}`}
                        />
                        {live.queuedPlayers > 0 && (
                            <StatTile
                                icon={
                                    <span className={statIconClass}>
                                        <Hourglass className="h-4 w-4" />
                                    </span>
                                }
                                label="Queued"
                                value={live.queuedPlayers}
                            />
                        )}
                        <StatTile
                            icon={
                                <img
                                    src={`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`}
                                    alt="Server map"
                                    onClick={() =>
                                        setLightbox({
                                            src: `/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`,
                                            alt: "Server map",
                                        })
                                    }
                                    className="h-9 w-9 shrink-0 cursor-zoom-in rounded-lg border border-border object-cover opacity-80 transition-opacity hover:opacity-100"
                                />
                            }
                            label="Map"
                            value={live.mapName}
                        />
                        <StatTile
                            icon={
                                <span className={statIconClass}>
                                    <Clock className="h-4 w-4" />
                                </span>
                            }
                            label="Wiped"
                            value={relativeTime(new Date(live.wipeTime * 1000).toISOString())}
                        />
                    </div>

                    {hasModule("map-events") && live.activeEvents.length > 0 && (
                        <SectionCard icon={<Radar className="h-4 w-4" />} title="Active events" count={live.activeEvents.length}>
                            <div className="divide-y divide-border/60">
                                {live.activeEvents.map((event, i) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3">
                                        <span className="text-sm text-neutral-200">{event.label}</span>
                                        <span className="font-mono text-xs text-neutral-500">{event.grid}</span>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {hasModule("smart-switches") && live.switches.length > 0 && (
                        <SectionCard icon={<Zap className="h-4 w-4" />} title="Switches" count={live.switches.length}>
                            <div className="grid divide-y divide-border/60 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-border/60">
                                {live.switches.map((sw) =>
                                    sw.unavailable ? (
                                        <UnavailableRow
                                            key={sw.id}
                                            name={sw.name}
                                            id={sw.id}
                                            onRename={(name) => renameDevice("smartSwitch", sw.id, name)}
                                            onRemove={() => removeDevice("smartSwitch", sw.id)}
                                        />
                                    ) : (
                                        <div key={sw.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                            <InlineRename
                                                name={sw.name}
                                                subtitle={sw.id}
                                                onRename={(name) => renameDevice("smartSwitch", sw.id, name)}
                                            />
                                            <div className="flex shrink-0 items-center gap-2.5">
                                                <span className={`text-xs font-medium ${sw.value ? "text-accent" : "text-neutral-600"}`}>
                                                    {sw.value ? "On" : "Off"}
                                                </span>
                                                {data.isActive ? (
                                                    <Toggle checked={sw.value} onChange={(checked) => toggleSwitch(sw.id, checked)} />
                                                ) : null}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {hasModule("smart-alarms") && live.alarms.length > 0 && (
                        <SectionCard icon={<Bell className="h-4 w-4" />} title="Alarms" count={live.alarms.length}>
                            <div className="divide-y divide-border/60">
                                {live.alarms.map((alarm) =>
                                    alarm.unavailable ? (
                                        <UnavailableRow
                                            key={alarm.id}
                                            name={alarm.name}
                                            id={alarm.id}
                                            onRename={(name) => renameDevice("smartAlarm", alarm.id, name)}
                                            onRemove={() => removeDevice("smartAlarm", alarm.id)}
                                        />
                                    ) : (
                                        (() => {
                                            const recent =
                                                !!alarm.lastTriggered && Date.now() - new Date(alarm.lastTriggered).getTime() < 10 * 60_000;
                                            return (
                                                <div key={alarm.id} className="flex items-center justify-between px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span
                                                            className={`h-2 w-2 rounded-full ${recent ? "animate-pulse bg-red-500" : "bg-neutral-700"}`}
                                                        />
                                                        <InlineRename
                                                            name={alarm.name}
                                                            subtitle={alarm.id}
                                                            onRename={(name) => renameDevice("smartAlarm", alarm.id, name)}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-neutral-500">
                                                        Last triggered: {relativeTime(alarm.lastTriggered)}
                                                    </span>
                                                </div>
                                            );
                                        })()
                                    ),
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {hasModule("storage-monitors") && cupboards.length > 0 && (
                        <SectionCard icon={<Shield className="h-4 w-4" />} title="Tool cupboards" count={cupboards.length}>
                            <StorageCardList
                                entities={cupboards}
                                onRename={renameDevice}
                                onRemove={removeDevice}
                                badge={(tc) => (
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${upkeepTierClass[upkeepTier(tc.protectionExpiry)]}`}>
                                        {upkeepRemaining(tc.protectionExpiry)}
                                    </span>
                                )}
                            />
                        </SectionCard>
                    )}

                    {hasModule("storage-monitors") && storageBoxes.length > 0 && (
                        <SectionCard icon={<Box className="h-4 w-4" />} title="Storage" count={storageBoxes.length}>
                            <StorageCardList entities={storageBoxes} onRename={renameDevice} onRemove={removeDevice} />
                        </SectionCard>
                    )}

                    {hasModule("vending-search") && data.isActive && (
                        <SectionCard icon={<Store className="h-4 w-4" />} title="Vending search">
                            <div className="p-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        value={vendingQuery}
                                        onChange={(e) => setVendingQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && searchVending()}
                                        placeholder="Search for an item…"
                                        disabled={vendingSearching}
                                        className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50"
                                    />
                                    <button
                                        onClick={searchVending}
                                        disabled={vendingSearching || !vendingQuery.trim()}
                                        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                                    >
                                        <Search className="h-3.5 w-3.5" />
                                        {vendingSearching ? "Searching…" : "Search"}
                                    </button>
                                </div>
                                {vendingError && <p className="mt-2 text-xs text-red-400">{vendingError}</p>}
                                {vendingResults &&
                                    (vendingResults.length === 0 ? (
                                        <p className="mt-3 text-xs text-neutral-500">No vending machines selling that item.</p>
                                    ) : (
                                        <ul className="mt-3 flex flex-col gap-1.5">
                                            {vendingResults.map((line, i) => (
                                                <li key={i} className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-neutral-300">
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    ))}
                            </div>
                        </SectionCard>
                    )}
                </div>
            )}
            {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
