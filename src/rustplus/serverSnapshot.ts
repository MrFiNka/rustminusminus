import { RustPlus, AppMarkerType, type AppEntityPayload, type AppTeamMessage } from "rustminus";
import type { Types } from "mongoose";
import type { TeamClass } from "../models/Team";
import { ServerModel } from "../models/Server";
import { getActiveRustplus, getFreshTeam } from "./connections";
import { withCache } from "../utils";
import { displayName, type PairedItemKind } from "./pairedItems";
import { readStorageEntity, describeStoragePayload, type StorageEntity } from "./storageMonitors";
import { getItemCatalog } from "./itemCatalog";
import { toGridReference } from "./gridReference";
import { EVENT_LABELS_BY_MARKER_TYPE } from "./markerLabels";

export type { StorageEntity };

export interface MapEvent {
    type: string;
    label: string;
    grid: string;
}

/** One team-chat line, as shown in the web chat panel. Mirrors the loader's `recentChat` shape. */
export interface ChatMessage {
    name: string;
    message: string;
    time: number;
}

export interface ServerSnapshot {
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapName: string;
    wipeTime: number;
    switches: { id: string; name: string; value: boolean; unavailable?: boolean }[];
    alarms: { id: string; name: string; value: boolean; lastTriggered: string | null; unavailable?: boolean }[];
    storage: StorageEntity[];
    activeEvents: MapEvent[];
}

type TeamServer = TeamClass["servers"][number];
type ServerMarkers = Awaited<ReturnType<RustPlus["getMapMarkers"]>>;

// How long the info-level fields (players/queued/map/wipe/events) of a snapshot are trusted before a
// refresh. Device state (switches/alarms/storage) doesn't age out on this timer - it's kept current
// by live `entityChanged` broadcasts (see applyEntityChanged), so a snapshot this old still shows
// correct device state. Bumped well past the old 4s because live push now keeps devices fresh, so the
// only thing this TTL gates is how stale the header stats can get - which lets F5 spam collapse to at
// most one RCON read per window instead of one per refresh.
const SNAPSHOT_TTL_MS = 30_000;
const MAP_TTL_MS = 5 * 60_000;

// Map entries are whole JPEG images, so this cache is capped by count as well as by TTL - a busy
// instance touching many team/server pairs within one TTL window would otherwise hold every one of
// them in memory at once.
const MAP_CACHE_MAX_ENTRIES = 32;

// How many recent team-chat lines the live store keeps per team. Seeded once from getTeamChat when
// the live entry is first built, then kept current by live `teamMessage` broadcasts.
const CHAT_BUFFER_SIZE = 30;

// Ephemeral (non-active-server) snapshots still go through this short-lived promise cache; the active
// server instead uses the live store below, which is kept warm by websocket events.
const snapshotCache = new Map<string, { expires: number; promise: Promise<ServerSnapshot | { error: string }> }>();
const mapCache = new Map<string, { expires: number; promise: Promise<Uint8Array | { error: string }> }>();

/** A browser (or any consumer) subscribed to live snapshot pushes for one active server. */
export interface LiveWatcher {
    send(data: string): void;
    close(): void;
}

/**
 * In-memory live snapshot for a team's *active* server (the only server with a persistent Rust+
 * connection). Held as a mutable object so `entityChanged` broadcasts can patch a single device in
 * place, and so a 30s timer can refresh just the header stats - all without re-running the expensive
 * per-entity RCON fan-out. Keyed by teamId; there is at most one active server per team.
 */
interface LiveEntry {
    serverId: string;
    snapshot?: ServerSnapshot;
    infoExpires: number;
    watchers: Set<LiveWatcher>;
    refreshTimer?: ReturnType<typeof setInterval>;
    building?: Promise<ServerSnapshot | { error: string }>;
    // Recent team chat (last CHAT_BUFFER_SIZE lines). `undefined` until seeded from getTeamChat on
    // first build; kept current afterwards by applyTeamMessage.
    chat?: ChatMessage[];
}
const liveEntries = new Map<string, LiveEntry>(); // key: teamId.toString()

/** Clears the cached ephemeral snapshot for a non-active server (e.g. after a manual re-ping). The
 *  active server's live entry is kept current by events, so this is a no-op for it. */
export function invalidateServerSnapshot(teamId: Types.ObjectId | string, serverId: string) {
    snapshotCache.delete(`${teamId}:${serverId}`);
}

/**
 * Resolves a RustPlus connection to use for `serverId`: reuses the team's persistent connection
 * when it's their currently-active server, otherwise opens a short-lived one using whichever team
 * member has credentials for it. Callers must disconnect when `ephemeral` is true.
 */
async function resolveConnection(team: TeamClass, serverId: string): Promise<{ rustplus: RustPlus; ephemeral: boolean } | { error: string }> {
    if (serverId === team.activeServerId) {
        // isConnected matters: a dropped-but-not-yet-cleaned socket is still in the map, and handing
        // it back made every snapshot fail instead of falling through to a fresh ephemeral connection.
        const activeConn = getActiveRustplus(team._id);
        if (activeConn?.isConnected()) return { rustplus: activeConn, ephemeral: false };
    }

    const users = await team.getUsers();
    let steamId: string | undefined;
    let playerToken: string | undefined;
    for (const user of users) {
        const cred = user.credentials.servers.find(c => c.serverId === serverId);
        if (cred) {
            steamId = user.credentials.steam_id;
            playerToken = cred.playerToken;
            break;
        }
    }
    if (!steamId || !playerToken) return { error: "No team member has credentials for this server" };

    const serverDb = await ServerModel.findOne({ serverId });
    if (!serverDb) return { error: "Server not found" };

    const rustplus = new RustPlus({
        server: serverDb.ip,
        port: Number(serverDb.port),
        playerId: steamId,
        playerToken: Number(playerToken),
        trackTeam: false,
    });
    try {
        await rustplus.connect();
    } catch {
        return { error: "Could not connect to this server" };
    }
    return { rustplus, ephemeral: true };
}

function shapeEvents(markers: ServerMarkers, mapSize: number): MapEvent[] {
    return markers
        .filter(m => m.type in EVENT_LABELS_BY_MARKER_TYPE)
        .map(m => ({
            type: AppMarkerType[m.type] ?? String(m.type),
            label: EVENT_LABELS_BY_MARKER_TYPE[m.type]!,
            grid: toGridReference(m.x, m.y, mapSize),
        }));
}

async function buildSnapshot(rustplus: RustPlus, server: TeamServer): Promise<ServerSnapshot> {
    const info = await rustplus.getInfo();

    const [switches, alarms, storage, markers] = await Promise.all([
        Promise.all(server.pairedItems.smartSwitch.map(async s => {
            // A destroyed/unpaired entity makes Rust+ reply "not_found", which getEntityInfo turns
            // into a rejection - catch it per-entity so one dead device flags itself as unavailable
            // instead of taking down the whole snapshot (and with it the entire server page/ping).
            try {
                const entityInfo = await rustplus.getEntityInfo(Number(s.id));
                return { id: s.id, name: displayName(s, "smartSwitch"), value: entityInfo.payload?.value ?? false };
            } catch {
                return { id: s.id, name: displayName(s, "smartSwitch"), value: false, unavailable: true };
            }
        })),
        Promise.all(server.pairedItems.smartAlarm.map(async a => {
            const lastTriggered = a.lastTriggered ? a.lastTriggered.toISOString() : null;
            try {
                const entityInfo = await rustplus.getEntityInfo(Number(a.id));
                return {
                    id: a.id,
                    name: displayName(a, "smartAlarm"),
                    value: entityInfo.payload?.value ?? false,
                    lastTriggered,
                };
            } catch {
                return { id: a.id, name: displayName(a, "smartAlarm"), value: false, lastTriggered, unavailable: true };
            }
        })),
        Promise.all(server.pairedItems.storageMonitor.map(async s => {
            try {
                return await readStorageEntity(rustplus, s);
            } catch {
                return {
                    id: s.id,
                    name: displayName(s, "storageMonitor"),
                    kind: "storage" as const,
                    capacity: 0,
                    items: [],
                    unavailable: true,
                };
            }
        })),
        // best-effort: a marker-fetch failure shouldn't take down the rest of the snapshot
        rustplus.getMapMarkers().catch(() => [] as unknown as ServerMarkers),
    ]);

    return {
        players: info.players,
        maxPlayers: info.maxPlayers,
        queuedPlayers: info.queuedPlayers,
        mapName: info.map,
        wipeTime: info.wipeTime,
        switches,
        alarms,
        storage,
        activeEvents: shapeEvents(markers, info.mapSize),
    };
}

// ---------------------------------------------------------------------------
// Live store (active server)
// ---------------------------------------------------------------------------

/** Sends the current snapshot to every subscribed watcher. */
function broadcast(entry: LiveEntry): void {
    if (!entry.snapshot) return;
    const msg = JSON.stringify({ type: "snapshot", data: entry.snapshot });
    for (const w of entry.watchers) {
        try { w.send(msg); } catch { /* dead socket - its close handler will unsubscribe it */ }
    }
}

/** Returns the active server's live snapshot, rebuilding it if the info fields have gone stale.
 *  Concurrent rebuilds share one in-flight promise. */
async function getLiveSnapshot(team: TeamClass, server: TeamServer): Promise<ServerSnapshot | { error: string }> {
    const key = team._id.toString();
    let entry = liveEntries.get(key);
    if (entry?.snapshot && entry.infoExpires > Date.now()) return entry.snapshot;
    if (entry?.building) return entry.building;

    if (!entry) {
        entry = { serverId: server.serverId, infoExpires: 0, watchers: new Set() };
        liveEntries.set(key, entry);
    }

    const building = (async (): Promise<ServerSnapshot | { error: string }> => {
        const conn = await resolveConnection(team, server.serverId);
        if ("error" in conn) return conn;
        try {
            const snapshot = await buildSnapshot(conn.rustplus, server);
            // Seed the chat buffer once, over the same connection, so a browser gets recent history on
            // connect. Best-effort: a failed read leaves an empty buffer that live messages fill in.
            if (entry.chat === undefined) {
                try {
                    const chat = await conn.rustplus.getTeamChat();
                    entry.chat = chat.slice(-CHAT_BUFFER_SIZE).map(m => ({ name: m.name, message: m.message, time: m.time }));
                } catch { entry.chat = []; }
            }
            return snapshot;
        } catch (err) {
            return { error: err instanceof Error ? err.message : "Failed to read live server state" };
        } finally {
            if (conn.ephemeral) conn.rustplus.disconnect();
        }
    })();
    entry.building = building;
    const result = await building;
    entry.building = undefined;

    if ("error" in result) {
        // Drop a never-populated husk so we don't leak entries; keep any prior good snapshot (and its
        // watchers) so a transient failure doesn't disconnect everyone.
        if (!entry.snapshot && entry.watchers.size === 0) liveEntries.delete(key);
        return result;
    }
    entry.snapshot = result;
    entry.infoExpires = Date.now() + SNAPSHOT_TTL_MS;
    broadcast(entry);
    return result;
}

/** 30s tick (only while watched): refresh just the header stats via the cheap getInfo/getMapMarkers
 *  calls - no per-entity fan-out - then push. Falls back to a full build if none exists yet.
 *
 *  Takes ids rather than documents: this runs on an interval that outlives the request that started
 *  it, so closing over the `TeamClass` handed to subscribeLive would pin a document that goes stale
 *  (and keeps it alive) for as long as anyone has the page open. */
async function tickRefresh(entry: LiveEntry, teamId: string, serverId: string): Promise<void> {
    const conn = getActiveRustplus(teamId);
    if (!conn) return; // no longer the active connection; closeLiveEntry will tear this down
    if (!entry.snapshot) {
        const team = await getFreshTeam(teamId);
        const server = team?.servers.find(s => s.serverId === serverId);
        if (team && server) await getLiveSnapshot(team, server);
        return;
    }
    try {
        const info = await conn.getInfo();
        const markers = await conn.getMapMarkers().catch(() => [] as unknown as ServerMarkers);
        if (!entry.snapshot) return;
        entry.snapshot.players = info.players;
        entry.snapshot.maxPlayers = info.maxPlayers;
        entry.snapshot.queuedPlayers = info.queuedPlayers;
        entry.snapshot.mapName = info.map;
        entry.snapshot.wipeTime = info.wipeTime;
        entry.snapshot.activeEvents = shapeEvents(markers, info.mapSize);
        entry.infoExpires = Date.now() + SNAPSHOT_TTL_MS;
        broadcast(entry);
    } catch { /* transient; retry next tick */ }
}

function startRefresh(entry: LiveEntry, teamId: string, serverId: string): void {
    if (entry.refreshTimer || entry.watchers.size === 0) return;
    entry.refreshTimer = setInterval(() => { void tickRefresh(entry, teamId, serverId); }, SNAPSHOT_TTL_MS);
}

/** Subscribes a watcher to the active server's live snapshot: sends it the current snapshot and
 *  starts the 30s header refresh while anyone is watching. Auth is the caller's responsibility. */
export async function subscribeLive(team: TeamClass, serverId: string, watcher: LiveWatcher): Promise<void> {
    const server = team.servers.find(s => s.serverId === serverId);
    if (!server) { watcher.close(); return; }

    const snap = await getLiveSnapshot(team, server);
    const entry = liveEntries.get(team._id.toString())
        ?? (() => {
            const bare: LiveEntry = { serverId, infoExpires: 0, watchers: new Set() };
            liveEntries.set(team._id.toString(), bare);
            return bare;
        })();

    entry.watchers.add(watcher);
    if (!("error" in snap)) watcher.send(JSON.stringify({ type: "snapshot", data: snap }));
    // Chat panels (TeamDetail) seed their history from this; device pages ignore the frame.
    watcher.send(JSON.stringify({ type: "chatHistory", data: entry.chat ?? [] }));
    startRefresh(entry, team._id.toString(), serverId);
}

/** Removes a watcher from whichever entry holds it; stops the refresh timer once none remain. */
export function unsubscribeLive(watcher: LiveWatcher): void {
    for (const entry of liveEntries.values()) {
        if (entry.watchers.delete(watcher) && entry.watchers.size === 0 && entry.refreshTimer) {
            clearInterval(entry.refreshTimer);
            entry.refreshTimer = undefined;
        }
    }
}

/**
 * Appends a live team-chat line to the team's chat buffer and pushes it to watchers, so open chat
 * panels update without a reload. No-op when there's no live entry for this team yet (nobody has
 * built the active server's live store). Wired directly off the Rust+ `teamMessage` event in
 * connectTeam - not through the module dispatcher - so chat stays live regardless of which modules
 * are enabled, mirroring applyEntityChanged.
 */
export function applyTeamMessage(team: TeamClass, message: AppTeamMessage): void {
    const entry = liveEntries.get(team._id.toString());
    if (!entry) return;
    const line: ChatMessage = { name: message.name, message: message.message, time: message.time };
    if (!entry.chat) entry.chat = [];
    entry.chat.push(line);
    if (entry.chat.length > CHAT_BUFFER_SIZE) entry.chat.splice(0, entry.chat.length - CHAT_BUFFER_SIZE);
    const msg = JSON.stringify({ type: "chat", data: line });
    for (const w of entry.watchers) {
        try { w.send(msg); } catch { /* dead socket - its close handler will unsubscribe it */ }
    }
}

/** Patches a single device in the live snapshot from a Rust+ `entityChanged` broadcast, then pushes
 *  the updated snapshot to watchers. No-op if there's no live entry / snapshot for this team yet. */
export async function applyEntityChanged(team: TeamClass, entityId: number, payload: AppEntityPayload): Promise<void> {
    const entry = liveEntries.get(team._id.toString());
    if (!entry?.snapshot) return;
    const id = String(entityId);
    const snap = entry.snapshot;

    const sw = snap.switches.find(s => s.id === id);
    if (sw) {
        sw.value = payload.value ?? false;
        delete sw.unavailable;
        broadcast(entry);
        return;
    }
    const alarm = snap.alarms.find(a => a.id === id);
    if (alarm) {
        alarm.value = payload.value ?? false;
        if (payload.value === true) alarm.lastTriggered = new Date().toISOString();
        delete alarm.unavailable;
        broadcast(entry);
        return;
    }
    const storageIdx = snap.storage.findIndex(s => s.id === id);
    if (storageIdx !== -1) {
        const catalog = await getItemCatalog();
        snap.storage[storageIdx] = describeStoragePayload({ id, name: snap.storage[storageIdx]!.name }, payload, catalog);
        broadcast(entry);
    }
}

/**
 * Appends a freshly-paired device to the live snapshot and pushes it to watchers, so FCM pairings
 * show up on an open page without a reload. Deliberately a single-entity read (not a full rebuild):
 * bulk in-game pairing calls this many times in a row, and a per-pair fan-out would recreate the very
 * RCON spike the live store exists to avoid. No-op when nothing is cached yet - the device is already
 * in team.servers, so the next full build will include it.
 */
export async function addLiveEntity(
    team: TeamClass,
    serverId: string,
    kind: PairedItemKind,
    entityId: string | number,
    payload?: AppEntityPayload,
): Promise<void> {
    const entry = liveEntries.get(team._id.toString());
    if (!entry?.snapshot || entry.serverId !== serverId) return;
    const id = String(entityId);
    const snap = entry.snapshot;

    if (kind === "smartSwitch" && snap.switches.some(e => e.id === id)) return;
    if (kind === "smartAlarm" && snap.alarms.some(e => e.id === id)) return;
    if (kind === "storageMonitor" && snap.storage.some(e => e.id === id)) return;

    // Fetch the current state if the caller didn't already have it; a destroyed/unreadable entity
    // still gets added, flagged unavailable, mirroring buildSnapshot's per-entity handling.
    let unavailable = false;
    if (!payload) {
        try {
            payload = (await getActiveRustplus(team._id)?.getEntityInfo(Number(id)))?.payload;
        } catch {
            unavailable = true;
        }
    }

    if (kind === "smartSwitch") {
        snap.switches.push({ id, name: displayName({ id }, kind), value: payload?.value ?? false, ...(unavailable ? { unavailable: true } : {}) });
    } else if (kind === "smartAlarm") {
        snap.alarms.push({ id, name: displayName({ id }, kind), value: payload?.value ?? false, lastTriggered: null, ...(unavailable ? { unavailable: true } : {}) });
    } else if (unavailable) {
        snap.storage.push({ id, name: displayName({ id }, kind), kind: "storage", capacity: 0, items: [], unavailable: true });
    } else {
        snap.storage.push(describeStoragePayload({ id }, payload, await getItemCatalog()));
    }
    broadcast(entry);
}

/** Reflects a device rename in the live snapshot (rename is DB-only, so it emits no Rust+ event). */
export function renameLiveEntity(teamId: Types.ObjectId | string, kind: PairedItemKind, id: string, name: string): void {
    const entry = liveEntries.get(teamId.toString());
    if (!entry?.snapshot) return;
    const arr = kind === "smartSwitch" ? entry.snapshot.switches
        : kind === "smartAlarm" ? entry.snapshot.alarms
            : entry.snapshot.storage;
    const item = arr.find(e => e.id === id);
    if (!item) return;
    item.name = name;
    broadcast(entry);
}

/** Reflects a device unpair in the live snapshot (remove is DB-only, so it emits no Rust+ event). */
export function removeLiveEntity(teamId: Types.ObjectId | string, kind: PairedItemKind, id: string): void {
    const entry = liveEntries.get(teamId.toString());
    if (!entry?.snapshot) return;
    const snap = entry.snapshot;
    if (kind === "smartSwitch") snap.switches = snap.switches.filter(e => e.id !== id);
    else if (kind === "smartAlarm") snap.alarms = snap.alarms.filter(e => e.id !== id);
    else snap.storage = snap.storage.filter(e => e.id !== id);
    broadcast(entry);
}

/** Tears down a team's live entry (on disconnect / active-server change): stops the refresh timer and
 *  tells watchers the server is gone so they stop showing live data and fall back. */
export function closeLiveEntry(teamId: Types.ObjectId | string): void {
    const key = teamId.toString();
    const entry = liveEntries.get(key);
    if (!entry) return;
    if (entry.refreshTimer) clearInterval(entry.refreshTimer);
    const msg = JSON.stringify({ type: "closed" });
    for (const w of entry.watchers) {
        try { w.send(msg); w.close(); } catch { /* already gone */ }
    }
    liveEntries.delete(key);
}

/** Live device/server snapshot for one of a team's paired servers. The active server is served from
 *  the live store (kept current by websocket events); other servers use a short {@link SNAPSHOT_TTL_MS}
 *  promise cache over a fresh ephemeral connection. */
export async function getServerSnapshot(team: TeamClass, serverId: string): Promise<ServerSnapshot | { error: string }> {
    const server = team.servers.find(s => s.serverId === serverId);
    if (!server) return { error: "This team hasn't paired with that server" };

    if (serverId === team.activeServerId) return getLiveSnapshot(team, server);

    return withCache(snapshotCache, `${team._id}:${serverId}`, SNAPSHOT_TTL_MS, async () => {
        const conn = await resolveConnection(team, serverId);
        if ("error" in conn) return conn;
        try {
            return await buildSnapshot(conn.rustplus, server);
        } catch (err) {
            // Never let a Rust+ failure bubble out as an unhandled rejection - the route handlers
            // above would turn it into a non-JSON error body (e.g. "not_found"), which the client's
            // res.json() then chokes on. Surface it as a normal error result instead.
            return { error: err instanceof Error ? err.message : "Failed to read live server state" };
        } finally {
            if (conn.ephemeral) conn.rustplus.disconnect();
        }
    });
}

/** Raw JPEG map image bytes for a team's paired server - see {@link resolveConnection}. Cached for {@link MAP_TTL_MS} since the map only changes on wipe. */
export async function getServerMap(team: TeamClass, serverId: string): Promise<Uint8Array | { error: string }> {
    return withCache(mapCache, `${team._id}:${serverId}`, MAP_TTL_MS, async () => {
        const conn = await resolveConnection(team, serverId);
        if ("error" in conn) return conn;
        try {
            const map = await conn.rustplus.getMap();
            return map.jpgImage;
        } catch {
            return { error: "Could not fetch the map" };
        } finally {
            if (conn.ephemeral) conn.rustplus.disconnect();
        }
    }, MAP_CACHE_MAX_ENTRIES);
}
