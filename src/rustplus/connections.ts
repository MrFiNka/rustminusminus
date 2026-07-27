import { RustPlus } from "rustminus";
import type { Types } from "mongoose";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";
import type { UserClass } from "../models/User";
import { GuildModel } from "../models/Guild";
import { TeamModel } from "../models/Team";
import { registry } from "../modules/ModuleRegistry";
import { withCache } from "../utils";
import { applyEntityChanged, applyTeamMessage, closeLiveEntry } from "./serverSnapshot";

const activeConnections = new Map<string, RustPlus>(); // key: teamId.toString()

// Send-only connections authenticated as an individual member's own Rust account, so a message
// they type in Discord goes out in-game under THEIR account instead of the team's single active
// account. Keyed by `${teamId}:${steamId}`, pooled and torn down after an idle timeout. These are
// deliberately NOT attached to the module dispatcher (registry.attach) - only the one per-team
// `activeConnections` entry drives modules/relays; attaching these would double-dispatch everything.
const userConnections = new Map<string, { conn: RustPlus; idle: ReturnType<typeof setTimeout> }>();
const USER_CONN_IDLE_MS = 5 * 60_000;

// Short-lived record of messages we just relayed into the game under a member's own account, so the
// team's tracking connection (which also receives every team-chat broadcast) doesn't bounce them
// back into Discord. The existing `steamId === rustplus.playerId` guard can't catch these since they
// now come from the sender's own steamId, not the active account's.
const relayedToGame = new Map<string, number>(); // `${teamId}:${steamId}:${text}` -> expiry ms
const RELAY_ECHO_TTL_MS = 15_000;

// ---------------------------------------------------------------------------
// Fresh team/guild resolution
// ---------------------------------------------------------------------------

/**
 * Long-lived consumers (the module dispatcher, the live-snapshot refresh timer) used to hold the
 * `TeamClass` instance they were handed at connect time and keep passing it around for the whole
 * life of the connection. Everything written elsewhere - a module setting changed on the Settings
 * page, a new chat prefix, a device paired in-game - lands on a *different* document and was simply
 * never seen, so those changes appeared to do nothing until the team reconnected.
 *
 * These resolvers hand out a current document instead. The short TTL keeps a per-chat-line DB read
 * off the hot path while bounding staleness to a couple of seconds; `invalidateTeam` makes a known
 * write visible immediately, and the TTL is the backstop for any write path that forgets to call it.
 */
const TEAM_DOC_TTL_MS = 2_000;

const teamDocCache = new Map<string, { expires: number; promise: Promise<TeamClass | null> }>();
const guildDocCache = new Map<string, { expires: number; promise: Promise<GuildClass | null> }>();

/** Current team document for `teamId`, cached for {@link TEAM_DOC_TTL_MS}. */
export function getFreshTeam(teamId: Types.ObjectId | string): Promise<TeamClass | null> {
    const key = teamId.toString();
    return withCache(teamDocCache, key, TEAM_DOC_TTL_MS, () => TeamModel.findById(key).exec());
}

/** Current guild document for a Discord guild id, cached for {@link TEAM_DOC_TTL_MS}. */
export function getFreshGuild(guildId: string): Promise<GuildClass | null> {
    return withCache(guildDocCache, guildId, TEAM_DOC_TTL_MS, () => GuildModel.findOne({ guildId }).exec());
}

/** Drops the cached document for a team so the next read reflects a write that just happened.
 *  Call after persisting anything a running module reads (settings, chat prefix, paired items). */
export function invalidateTeam(teamId: Types.ObjectId | string): void {
    teamDocCache.delete(teamId.toString());
}

export async function connectTeam(
    team: TeamClass,
    ip: string,
    port: string,
    steamId: string,
    playerToken: string | number,
): Promise<RustPlus | undefined> {
    const rustplus = new RustPlus({
        server: ip,
        port: Number(port),
        playerId: steamId,
        playerToken: Number(playerToken),
        trackTeam: true,
    });
    try {
        await rustplus.connect();
    } catch (error) {
        console.log("failed to connect rustplus for team", team._id, error);
        return undefined;
    }
    activeConnections.set(team._id.toString(), rustplus);
    const guild = await team.getGuild();
    if (guild) registry.attach(rustplus, team, guild);

    // Rust+ has no queryable "last triggered" for alarms - the only way to know is to catch the
    // live broadcast while connected, so this only tracks alarms on a team's currently-active
    // server. Re-fetches the team fresh rather than mutating the closed-over `team` so a
    // concurrent write (e.g. a new device being paired) isn't clobbered.
    rustplus.on("entityChanged", async (entityId, payload) => {
        if (payload.value !== true) return;
        const freshTeam = await TeamModel.findById(team._id);
        const server = freshTeam?.servers.find(s => s.serverId === freshTeam.activeServerId);
        const alarm = server?.pairedItems.smartAlarm.find(a => a.id === String(entityId));
        if (!alarm) return;
        alarm.lastTriggered = new Date();
        await freshTeam!.save();
    });

    // Keep the web dashboard's live snapshot current + push the change to any open browsers. Runs for
    // every entity change (switch flip, alarm trigger, storage update), not just alarms above.
    rustplus.on("entityChanged", (entityId, payload) => {
        void applyEntityChanged(team, entityId, payload);
    });

    // Feed the web dashboard's live chat buffer + push each new line to open team pages. Wired here
    // (not via the module dispatcher) so chat stays live even with no chat module enabled.
    rustplus.on("teamMessage", (message) => {
        applyTeamMessage(team, message);
    });

    return rustplus;
}

export function disconnectTeam(teamId: Types.ObjectId): void {
    disconnectTeamUserConnections(teamId);
    closeLiveEntry(teamId);
    const conn = activeConnections.get(teamId.toString());
    if (!conn) return;
    conn.disconnect();
    registry.detach(conn);
    activeConnections.delete(teamId.toString());
}

export function getActiveRustplus(teamId: Types.ObjectId | string): RustPlus | undefined {
    return activeConnections.get(teamId.toString());
}

function teardownUserConn(key: string): void {
    const entry = userConnections.get(key);
    if (!entry) return;
    clearTimeout(entry.idle);
    try { entry.conn.disconnect(); } catch { /* already gone */ }
    userConnections.delete(key);
}

function armUserConnIdle(key: string): void {
    const entry = userConnections.get(key);
    if (!entry) return;
    clearTimeout(entry.idle);
    entry.idle = setTimeout(() => teardownUserConn(key), USER_CONN_IDLE_MS);
}

/** Tears down every pooled per-user connection for a team (e.g. on disconnect / active-server change,
 *  so connections to the old server aren't left dangling). */
export function disconnectTeamUserConnections(teamId: Types.ObjectId): void {
    const prefix = `${teamId.toString()}:`;
    for (const key of [...userConnections.keys()]) {
        if (key.startsWith(prefix)) teardownUserConn(key);
    }
}

/** Returns a send-only RustPlus connection authenticated as `user`, for the team's active server,
 *  reusing a pooled one when possible. Returns undefined if the user hasn't paired the active server,
 *  there's no active server, or the connection fails (e.g. an expired token). */
export async function getOrCreateUserRustplus(team: TeamClass, user: UserClass): Promise<RustPlus | undefined> {
    if (!team.activeServerId) return undefined;
    const cred = user.credentials.servers.find(e => e.serverId === team.activeServerId);
    if (!cred) return undefined;

    // If this user IS the team's active credential account, the team's own tracking connection is
    // already authenticated as them - reuse it. Opening a second socket with the same player token
    // would make Rust+ evict the tracking connection (one socket per token), which silently kills the
    // inbound (game -> Discord) relay.
    const active = getActiveRustplus(team._id);
    if (active?.isConnected() && String(active.playerId) === String(user.credentials.steam_id)) {
        return active;
    }

    const key = `${team._id.toString()}:${user.credentials.steam_id}`;
    const existing = userConnections.get(key);
    if (existing?.conn.isConnected()) {
        armUserConnIdle(key);
        return existing.conn;
    }
    if (existing) teardownUserConn(key); // stale/disconnected - rebuild

    const server = await team.getActiveServer();
    if (!server) return undefined;

    const conn = new RustPlus({
        server: server.ip,
        port: Number(server.port),
        playerId: user.credentials.steam_id,
        playerToken: Number(cred.playerToken),
        trackTeam: false,
    });
    try {
        await conn.connect();
    } catch (error) {
        console.log("failed to connect per-user rustplus", key, error);
        return undefined;
    }
    userConnections.set(key, {
        conn,
        idle: setTimeout(() => teardownUserConn(key), USER_CONN_IDLE_MS),
    });
    return conn;
}

function echoKey(teamId: Types.ObjectId, steamId: string, text: string): string {
    return `${teamId.toString()}:${steamId}:${text}`;
}

/** Record that we just relayed `text` into the game as `steamId`, so the inbound broadcast of the
 *  same message can be recognised as our own echo and dropped (see consumeRelayedEcho). */
export function markRelayedToGame(teamId: Types.ObjectId, steamId: string, text: string): void {
    if (relayedToGame.size > 100) {
        const now = Date.now();
        for (const [k, exp] of relayedToGame) if (exp < now) relayedToGame.delete(k);
    }
    relayedToGame.set(echoKey(teamId, steamId, text), Date.now() + RELAY_ECHO_TTL_MS);
}

/** One-shot check+consume: true if this exact message was recently relayed to the game by us (and
 *  hasn't expired), meaning the inbound copy is an echo that should not be re-posted to Discord. */
export function consumeRelayedEcho(teamId: Types.ObjectId, steamId: string, text: string): boolean {
    const key = echoKey(teamId, steamId, text);
    const expiry = relayedToGame.get(key);
    if (expiry === undefined) return false;
    relayedToGame.delete(key);
    return expiry >= Date.now();
}

export async function connectAll(): Promise<void> {
    const guilds = await GuildModel.find();
    for (const guild of guilds) {
        for (const t of guild.teams) {
            const team = await TeamModel.findById(t._id);
            await team?.connectRustPlus();
        }
    }
}

/** Tears down every Rust+ socket this process owns - team connections, pooled per-user send
 *  connections, and the live snapshot entries that hang off them. For process shutdown. */
export function disconnectAll(): void {
    for (const key of [...userConnections.keys()]) teardownUserConn(key);
    for (const [teamId, conn] of activeConnections) {
        closeLiveEntry(teamId);
        try { conn.disconnect(); } catch { /* already gone */ }
        registry.detach(conn);
    }
    activeConnections.clear();
    relayedToGame.clear();
}
