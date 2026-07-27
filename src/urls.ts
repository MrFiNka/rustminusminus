/**
 * Absolute URLs into this bot's own web dashboard.
 *
 * Server-only: these read `Bun.env`, so they must never be imported from anything under
 * `src/client/` (which is bundled for the browser). `src/utils.ts` is client-importable, which is
 * why these live in their own module rather than there.
 */

/** `PROTOCOL://HOST:PORT`, matching the redirect URI registered in the Discord Developer Portal.
 *  The port is always included - deliberately, since changing that string would invalidate an
 *  already-registered OAuth redirect URI. */
function baseUrl(): string {
    return `${Bun.env.PROTOCOL}://${Bun.env.HOST}:${Bun.env.EXTERNALPORT}`;
}

/** Discord OAuth2 callback. Must exactly match a redirect URI registered for the application. */
export function oauthRedirectUri(): string {
    return `${baseUrl()}/callback`;
}

/** A team's dashboard page - members, servers, live status and team chat. */
export function teamPageUrl(guildId: string, teamId: string): string {
    return `${baseUrl()}/guild/${guildId}/teams/${teamId}`;
}
