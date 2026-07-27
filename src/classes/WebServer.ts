import staticPlugin from "@elysiajs/static";
import Elysia from "elysia";
import { sessionPlugin } from "./routes/session";
import { authRoutes } from "./routes/authRoutes";
import { modulesRoutes } from "./routes/modulesRoutes";
import { guildsRoutes } from "./routes/guildsRoutes";
import { teamsRoutes } from "./routes/teamsRoutes";
import { teamActionsRoutes } from "./routes/teamActionsRoutes";
import { settingsRoutes } from "./routes/settingsRoutes";
import { permissionGroupsRoutes } from "./routes/permissionGroupsRoutes";
import { chatLinksRoutes } from "./routes/chatLinksRoutes";
import { renderPage } from "../server/render";
import { GuildModel } from "../models/Guild";
import { findGuildTeam } from "../server/dataAccess/shared";
import { isTeamMemberOrAdmin } from "../permissions/web";
import { subscribeLive, unsubscribeLive, type LiveWatcher } from "../rustplus/serverSnapshot";

// Maps each live-data socket to the watcher registered for it, so `close` can unsubscribe exactly
// the watcher that `open` created (WeakMap so a dropped socket is GC'd without leaking).
const liveWatchers = new WeakMap<object, LiveWatcher>();

export class WebServer extends Elysia {
    static websockets: any[] = []; // fck elysia types
    constructor() {
        super();
        if (Bun.env.NODE_ENV == "development") {
            // Dev-only live-reload channel (browser reloads on any message). Moved off "/ws" so the
            // production live-data socket below can own that path.
            this
                .ws('/dev-ws', {
                    open(ws) {
                        WebServer.websockets.push(ws);
                    },
                    close(ws) {
                        WebServer.websockets = WebServer.websockets.filter(e => e.id != ws.id);
                    },
                });
        }
        this
            .use(staticPlugin({}))
            .onRequest(async ({ set, request }) => {
                const { pathname } = new URL(request.url);
                if (pathname.startsWith("/public/js/") || pathname.startsWith("/public/css/")) {
                    // these URLs are version-stamped (see websiteBuilding.ts's getAssetVersion) - in dev
                    // the version changes on every request so no-store is still correct, in prod it only
                    // changes on an actual rebuild so the response itself can be cached indefinitely
                    set.headers["Cache-Control"] = Bun.env.NODE_ENV == "development"
                        ? "no-cache, no-store, must-revalidate"
                        : "public, max-age=31536000, immutable";
                } else {
                    set.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                    set.headers["Pragma"] = "no-cache";
                    set.headers["Expires"] = 0;
                }
                if (request.method === "OPTIONS") {
                    set.status = 204;
                    return "";
                }
            })
            .use(sessionPlugin)
            .use(authRoutes)
            // Production live-data socket: pushes a team's active-server snapshot (switch/alarm/storage
            // state + 30s header refresh) to authorized browsers. Mounted after sessionPlugin so
            // ws.data.cookieToken is populated for the auth check.
            .ws("/ws", {
                async open(ws) {
                    try {
                        const { guildId, teamId, serverId } = ws.data.query as {
                            guildId?: string; teamId?: string; serverId?: string;
                        };
                        const cookieToken = (ws.data as unknown as { cookieToken?: string }).cookieToken;
                        if (!guildId || !teamId || !serverId) return ws.close();
                        const guild = await GuildModel.findOne({ guildId });
                        if (!guild) return ws.close();
                        const team = await findGuildTeam(guild, teamId);
                        // Live data only exists for the active server (the only persistent connection).
                        if (!team || serverId !== team.activeServerId) return ws.close();
                        if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return ws.close();
                        const watcher: LiveWatcher = { send: data => { ws.send(data); }, close: () => { ws.close(); } };
                        liveWatchers.set(ws, watcher);
                        await subscribeLive(team, serverId, watcher);
                    } catch {
                        ws.close();
                    }
                },
                close(ws) {
                    const watcher = liveWatchers.get(ws);
                    if (watcher) {
                        unsubscribeLive(watcher);
                        liveWatchers.delete(ws);
                    }
                },
            })
            .get("*", async ({ redirect, loggedIn, cookieToken, request }) => {
                if (!loggedIn) return redirect("/login");
                return await renderPage(request, cookieToken as string | undefined);
            })
            .group("api", e =>
                e
                    .get("healthcheck", () => {
                        return { status: "ok" }
                    })
                    .use(modulesRoutes)
                    .use(guildsRoutes)
                    .use(teamsRoutes)
                    .use(teamActionsRoutes)
                    .use(settingsRoutes)
                    .use(permissionGroupsRoutes)
                    .use(chatLinksRoutes)
            );
    }
}
