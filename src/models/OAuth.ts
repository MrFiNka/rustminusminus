import axios from "axios";
import { Document, model, Schema, Types } from "mongoose";
import crypto from "crypto"
import type { DiscordPartialGuild, DiscordUser } from "../types/DiscordApi";
import { withCache } from "../utils";
const OauthSchema = new Schema({
    cookieId: { type: String, required: true, unique: true },
    userId: { type: String },
    redirectTo: { type: String },
    expiration: { type: Date },
    accessToken: { type: String }
}, { timestamps: true });

// Sessions are only useful while their Discord access token is valid (loggedIn additionally
// requires `expiration > now`, and Discord tokens last days, not months). Expire the rows a month
// after their last write so abandoned and logged-out sessions don't accumulate forever - a returning
// visitor whose row has been reaped simply re-runs the OAuth flow.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
OauthSchema.index({ updatedAt: 1 }, { expireAfterSeconds: SESSION_TTL_SECONDS });

// Discord's /users/@me and /users/@me/guilds endpoints are tightly rate-limited per access
// token, and both are called on nearly every request (guild/team admin checks, the loggedIn
// gate). Cache successful responses per cookie so a burst of page/API calls doesn't trip
// Discord's rate limit and surface as spurious 401s. Failures are never cached, so a transient
// error just retries on the next call instead of being "stuck" for the TTL. In-flight requests
// are also deduped (the pending promise itself is cached) - without this, several requests
// landing before the first one resolves would each fire their own live Discord call and could
// still trip the rate limit even with a cache in place.
const DISCORD_CACHE_TTL_MS = 5 * 60_000;

export class OauthClass extends Document<Types.ObjectId> {
    cookieId!: string;
    userId?: string;
    redirectTo?: string;
    expiration?: Date;
    accessToken?: string;

    private static userCache = new Map<string, { expires: number; promise: Promise<DiscordUser> }>();
    private static guildsCache = new Map<string, { expires: number; promise: Promise<DiscordPartialGuild[]> }>();

    // withCache only skips caching a call that throws (see its doc comment), so a failed fetch
    // has to throw internally and get converted back to null here - this preserves the "failures
    // are never cached" behavior described above.
    async getUser(): Promise<DiscordUser | null> {
        try {
            return await withCache(OauthClass.userCache, this.cookieId, DISCORD_CACHE_TTL_MS, async () => {
                const userRes = await axios.get("https://discord.com/api/users/@me", {
                    headers: { Authorization: `Bearer ${this.accessToken}` },
                    validateStatus: () => true
                });
                if (userRes.status != 200) throw new Error(`Discord user fetch failed with status ${userRes.status}`);
                return userRes.data;
            });
        } catch {
            return null;
        }
    }

    async getGuilds(): Promise<DiscordPartialGuild[] | null> {
        try {
            return await withCache(OauthClass.guildsCache, this.cookieId, DISCORD_CACHE_TTL_MS, async () => {
                const guilds = await axios.get("https://discord.com/api/users/@me/guilds", {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                    validateStatus: () => true
                });
                if (guilds.status != 200) throw new Error(`Discord guilds fetch failed with status ${guilds.status}`);
                return guilds.data;
            });
        } catch {
            return null;
        }
    }

    static generateRandomString(length = 64) {
        return crypto.randomBytes(length).toString("hex").slice(0, length);
    }

    static async generateUniqueCookieId(length = 64): Promise<string> {
        const candidate = this.generateRandomString(length);
        const exists = await OauthModel.exists({ cookieId: candidate });
        if (exists) {
            return this.generateUniqueCookieId(length);
        }
        return candidate;
    }

}

OauthSchema.loadClass(OauthClass);

export const OauthModel = model<OauthClass>("Oauth", OauthSchema);