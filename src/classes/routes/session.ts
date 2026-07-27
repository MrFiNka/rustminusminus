import Elysia from "elysia";
import { OauthClass, OauthModel } from "../../models/OAuth";

const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;

const COOKIE_OPTIONS = {
    sameSite: "lax",
    httpOnly: true,
    secure: true,
    path: "/",
} as const;

/**
 * Derives `cookieToken` (minting one if the request has none yet) and `loggedIn` globally, so every
 * route composed from this plugin sees them typed without a cast. Named + exported as a single
 * shared instance so Elysia's plugin deduplication (by name) runs this derive logic once per
 * request even though several route files `.use()` it independently.
 *
 * The token is deliberately NOT persisted here. This used to `OauthModel.create()` a row for every
 * request that arrived without a valid cookie - which meant every crawler, health probe and
 * cookie-less client permanently grew the collection. A cookie with no row is simply an anonymous
 * session (`loggedIn` is false, every `findOne` by cookieId misses); the row is created by the
 * OAuth callback, at the point there's actually something worth storing.
 */
export const sessionPlugin = new Elysia({ name: "session" })
    .derive({ as: "global" }, ({ cookie: { token } }) => {
        if (token?.value) return { cookieToken: token.value };

        // 64 hex chars = 256 bits of entropy, and cookieId carries a unique index - a collision
        // check round-trip per cookie-less request would cost more than it could ever prevent.
        const freeToken = OauthClass.generateRandomString();
        token?.set({
            ...COOKIE_OPTIONS,
            expires: new Date(Date.now() + COOKIE_MAX_AGE_MS),
            value: freeToken,
        });
        return { cookieToken: freeToken };
    })
    .derive({ as: "global" }, async ({ cookieToken }) => {
        if (!cookieToken) return { loggedIn: false };
        const auth = await OauthModel.findOne({ cookieId: cookieToken });
        if (!auth) return { loggedIn: false };
        if (!auth.accessToken) return { loggedIn: false };
        if (!auth.userId) return { loggedIn: false };
        if (!auth.expiration || auth.expiration < new Date()) return { loggedIn: false };
        if (await auth.getUser() == null) return { loggedIn: false };
        return { loggedIn: true };
    });
