import type { ServerSnapshot } from "./serverDetail.types";
import { useLiveSocket } from "./useLiveSocket";

/**
 * The latest {@link ServerSnapshot} pushed over the `/ws` live-data socket for a team's active
 * server. Returns null when disabled, before the first push, or after the server signals it's no
 * longer active. A thin selector over {@link useLiveSocket}, which owns the connection.
 *
 * `enabled` should be the page's `isActive` - only the active server has a live connection to push.
 */
export function useLiveSnapshot(
    guildId: string | undefined,
    teamId: string | undefined,
    serverId: string | undefined,
    enabled: boolean,
): ServerSnapshot | null {
    return useLiveSocket(guildId, teamId, serverId, enabled).snapshot;
}
