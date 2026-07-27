/** Shared help text for the teamchat bridge - shown wherever a user is told (Discord or web) that
 *  they can't send messages yet. Keep the wording identical across surfaces. */
export const CHAT_PAIRING_HELP =
    "To send messages you need to link Rust+ and pair this server: connect to the server, then press Escape → Session → Rust+ → Pairing → Enable.";

export async function asyncFilter<T>(
    arr: T[],
    predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_, index) => results[index]);
}
/** Escapes a string for literal use inside a RegExp - needed when building a command matcher from a
 *  user-chosen chat prefix that could contain regex-special characters (e.g. ".", "+", "?"). */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getRandomHexColor(withHash: boolean = false): string {
    const color = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    return withHash ? `#${color}` : color;
}

/** Drops every entry whose TTL has passed. Called on miss (see withCache) - cheap, and a miss is
 *  exactly the moment the map is about to grow, so it's where a sweep pays for itself. */
function sweepExpired(cache: Map<string, { expires: number }>, now: number): void {
    for (const [k, entry] of cache) {
        if (entry.expires <= now) cache.delete(k);
    }
}

/**
 * De-dupes and rate-limits calls to `fn`: a cache hit within its TTL is served straight from the
 * map, and an in-flight call is shared with any other caller for the same key that lands before it
 * resolves (the pending promise itself is what's cached, before it has a value) - without this,
 * a burst of concurrent callers for the same key would each fire their own call.
 *
 * Expired entries are swept on miss. Without that these maps only ever grew: keys are per-cookie
 * (OAuth.ts) or per team+server (serverSnapshot.ts, where the map cache holds whole JPEG images),
 * so a stale entry was retained indefinitely even once it could never be served again.
 *
 * Pass `maxEntries` to additionally cap the map (evicting the entry closest to expiry) for caches
 * whose values are large enough that TTL alone isn't a tight enough bound.
 */
export function withCache<T>(
    cache: Map<string, { expires: number; promise: Promise<T> }>,
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    maxEntries?: number
): Promise<T> {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.promise;

    sweepExpired(cache, now);

    const promise = fn().catch(err => {
        cache.delete(key);
        throw err;
    });
    cache.set(key, { expires: now + ttlMs, promise });

    if (maxEntries !== undefined && cache.size > maxEntries) {
        // Everything left is unexpired, so evict whatever is closest to expiring - the entry with
        // the least remaining value. Never evict the one we just inserted.
        let oldestKey: string | undefined;
        let oldestExpiry = Infinity;
        for (const [k, entry] of cache) {
            if (k !== key && entry.expires < oldestExpiry) {
                oldestExpiry = entry.expires;
                oldestKey = k;
            }
        }
        if (oldestKey !== undefined) cache.delete(oldestKey);
    }

    return promise;
}

export function upkeepRemaining(protectionExpiry: number | null): string {
    if (protectionExpiry == null) return "Unknown";
    const remainingMs = protectionExpiry * 1000 - Date.now();
    if (remainingMs <= 0) return "Expired";
    const hours = Math.floor(remainingMs / 3_600_000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h ${Math.floor((remainingMs % 3_600_000) / 60_000)}m`;
}