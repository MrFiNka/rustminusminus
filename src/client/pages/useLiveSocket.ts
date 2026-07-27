import { useEffect, useState } from "react";
import type { LiveMarkerState, LiveTeamInfo, ServerSnapshot } from "./serverDetail.types";

/** One team-chat line pushed over the live socket. Mirrors the loader's `recentChat` shape. */
export interface ChatMessage {
    name: string;
    message: string;
    time: number;
}

// Keep the client-side buffer bounded, matching the server's CHAT_BUFFER_SIZE.
const MAX_CHAT = 30;
const RECONNECT_DELAY_MS = 2000;

export interface LiveSocketState {
    snapshot: ServerSnapshot | null;
    chat: ChatMessage[] | null;
    markers: LiveMarkerState | null;
    teamInfo: LiveTeamInfo | null;
}

const EMPTY: LiveSocketState = { snapshot: null, chat: null, markers: null, teamInfo: null };

/**
 * Subscribes to the production `/ws` live-data socket for a team's active server and returns
 * everything it pushes: the latest {@link ServerSnapshot} (switch/alarm/storage state, plus header
 * stats refreshed server-side every 30s), the live team chat (seeded from the `chatHistory` frame
 * sent on connect, then kept current by `chat` frames), the map marker layer (`markers`, pushed off
 * the same 30s tick the header stats use) and teammate positions (`teamInfo`, pushed on every Rust+
 * `teamChanged` event). All are null when disabled, before the first relevant frame, or after the
 * server signals the server is no longer active. Reconnects automatically with a fixed backoff.
 *
 * This owns the whole socket lifecycle for every concern deliberately: `useLiveSnapshot` and
 * `useLiveChat` used to be near-identical copies that each opened their own connection, so a page
 * wanting both would have opened two sockets and two server-side subscriptions for the same stream.
 * They're now thin selectors over this one, as is `useLiveMarkers`.
 *
 * `enabled` should reflect "this is the active server" - only the active server has a live
 * connection to push from.
 */
export function useLiveSocket(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    enabled: boolean,
): LiveSocketState {
    // Identifies which subscription the held state belongs to. Tagging the state this way lets a
    // change of target (or going disabled) be handled at render - see the return below - instead of
    // by resetting state from inside the effect, which would trigger a cascading re-render.
    const socketKey = enabled && guildId && teamId && serverId ? `${guildId}:${teamId}:${serverId}` : null;
    const [state, setState] = useState<LiveSocketState & { key: string | null }>({ key: null, ...EMPTY });

    useEffect(() => {
        if (!socketKey || !guildId || !teamId || !serverId) return;
        // `closed` = this effect was torn down; `stopped` = the server told us the server is no longer
        // active, so we must NOT reconnect (that endpoint would just reject us in a 2s retry storm). A
        // plain socket drop (e.g. server restart) still reconnects.
        let closed = false;
        let stopped = false;
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

        const connect = () => {
            if (closed || stopped) return;
            const proto = window.location.protocol === "https:" ? "wss" : "ws";
            const params = new URLSearchParams({ guildId, teamId, serverId });
            socket = new WebSocket(`${proto}://${window.location.host}/ws?${params}`);
            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data as string) as { type: string; data?: unknown };
                    // Every write carries socketKey, so a frame that lands after the target changed
                    // is discarded at render rather than shown against the wrong server.
                    if (msg.type === "snapshot" && msg.data) {
                        setState((prev) => ({ ...prev, key: socketKey, snapshot: msg.data as ServerSnapshot }));
                    } else if (msg.type === "chatHistory" && Array.isArray(msg.data)) {
                        const history = (msg.data as ChatMessage[]).slice(-MAX_CHAT);
                        setState((prev) => ({ ...prev, key: socketKey, chat: history }));
                    } else if (msg.type === "chat" && msg.data && !Array.isArray(msg.data)) {
                        const line = msg.data as ChatMessage;
                        setState((prev) => ({
                            ...prev,
                            key: socketKey,
                            chat: [...(prev.key === socketKey ? prev.chat ?? [] : []), line].slice(-MAX_CHAT),
                        }));
                    } else if (msg.type === "markers" && msg.data) {
                        setState((prev) => ({ ...prev, key: socketKey, markers: msg.data as LiveMarkerState }));
                    } else if (msg.type === "teamInfo" && msg.data) {
                        setState((prev) => ({ ...prev, key: socketKey, teamInfo: msg.data as LiveTeamInfo }));
                    } else if (msg.type === "closed") {
                        stopped = true;
                        setState({ key: socketKey, ...EMPTY });
                    }
                } catch { /* ignore malformed frames */ }
            };
            socket.onclose = () => {
                if (closed || stopped) return;
                reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
            };
            socket.onerror = () => { socket?.close(); };
        };
        connect();

        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [socketKey, guildId, teamId, serverId]);

    // Disabled, or the held state belongs to a previous target - report empty until the new
    // subscription delivers its first frame.
    if (state.key !== socketKey) return EMPTY;
    return { snapshot: state.snapshot, chat: state.chat, markers: state.markers, teamInfo: state.teamInfo };
}
