import { useLiveSocket, type ChatMessage } from "./useLiveSocket";

export type { ChatMessage };

/**
 * The live team chat for a team's active server, over the `/ws` live-data socket: seeded from the
 * `chatHistory` frame the server sends on connect, then kept current as `chat` frames arrive.
 * Returns null when disabled, before the first frame, or after the server signals it's no longer
 * active. A thin selector over {@link useLiveSocket}, which owns the connection.
 *
 * `enabled` should be `connected && has active server` - only the active server pushes live data.
 */
export function useLiveChat(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    enabled: boolean,
): ChatMessage[] | null {
    return useLiveSocket(guildId, teamId, serverId, enabled).chat;
}
