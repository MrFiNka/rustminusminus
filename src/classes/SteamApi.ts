import axios from "axios";
import { withCache } from "../utils";

// Steam persona names change far less often than Discord tokens expire, so this cache uses a
// longer TTL than the Discord OAuth one (OAuth.ts). A missing player for a given steamid (private
// profile, or a bad id) is cached as `null` the same as a real name - it's an expected steady
// state, not a transient error, so there's no need to hit Steam again every call for it.
const STEAM_CACHE_TTL_MS = 30 * 60_000;

const nameCache = new Map<string, { expires: number; promise: Promise<string | null> }>();

export async function getSteamName(steamId: string): Promise<string | null> {
    try {
        return await withCache(nameCache, steamId, STEAM_CACHE_TTL_MS, async () => {
            const res = await axios.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", {
                params: { key: Bun.env.STEAM_API_KEY, steamids: steamId },
                validateStatus: () => true,
            });
            if (res.status != 200) throw new Error(`Steam player summary fetch failed with status ${res.status}`);
            return res.data?.response?.players?.[0]?.personaname ?? null;
        });
    } catch {
        return null;
    }
}
