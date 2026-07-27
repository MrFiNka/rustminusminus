import type { ComponentType } from "react";
import type { LoaderFunction, RouteObject } from "react-router-dom";
import Layout from "./client/layout/Layout";
import * as GuildLayout from "./client/layout/GuildLayout";
import Home from "./client/pages/Home";
import * as Guilds from "./client/pages/Guilds";
import * as GlobalModules from "./client/pages/GlobalModules";
import * as Modules from "./client/pages/Modules";
import * as Teams from "./client/pages/Teams";
import * as TeamDetail from "./client/pages/TeamDetail";
import * as TeamModules from "./client/pages/TeamModules";
import * as TeamSettings from "./client/pages/TeamSettings";
import * as ServerDetail from "./client/pages/ServerDetail";
import * as PermissionGroups from "./client/pages/PermissionGroups";
import * as PermissionGroupDetail from "./client/pages/PermissionGroupDetail";
import * as ChatLinks from "./client/pages/ChatLinks";

function NotFound() {
    return <div>404</div>;
}

export interface RouteNode {
    /** react-router route id - only set where something depends on it (e.g. useRouteLoaderData("guild")). */
    id?: string;
    index?: true;
    path?: string;
    Component: ComponentType;
    ErrorBoundary?: ComponentType;
    /** Key into the loaders map passed to buildRouteObjects - omitted for routes with no loader. */
    loaderKey?: string;
    children?: RouteNode[];
}

/**
 * Shared shape of the app's route tree - path/Component/ErrorBoundary/children/id, with loaders
 * deliberately left out. src/client/router.tsx and src/server/router.tsx each call
 * buildRouteObjects() with their own loaders map (client: each page's fetch-based `loader`
 * export; server: `createXLoader(cookieToken)` from server/loaders/*), so both routers are built
 * from this one tree instead of being hand-maintained in sync.
 */
export const routeTree: RouteNode[] = [
    {
        path: "/",
        Component: Layout,
        children: [
            { index: true, Component: Home },
            { path: "guilds", Component: Guilds.Component, ErrorBoundary: Guilds.ErrorBoundary, loaderKey: "guilds" },
            { path: "modules", Component: GlobalModules.Component, ErrorBoundary: GlobalModules.ErrorBoundary, loaderKey: "globalModules" },
            {
                id: "guild",
                path: "guild/:guildId",
                Component: GuildLayout.Component,
                ErrorBoundary: GuildLayout.ErrorBoundary,
                loaderKey: "guildLayout",
                children: [
                    { path: "modules", Component: Modules.Component, ErrorBoundary: Modules.ErrorBoundary, loaderKey: "modules" },
                    { path: "teams", Component: Teams.Component, ErrorBoundary: Teams.ErrorBoundary, loaderKey: "teams" },
                    { path: "teams/:teamId", Component: TeamDetail.Component, ErrorBoundary: TeamDetail.ErrorBoundary, loaderKey: "teamDetail" },
                    { path: "teams/:teamId/modules", Component: TeamModules.Component, ErrorBoundary: TeamModules.ErrorBoundary, loaderKey: "teamModules" },
                    { path: "teams/:teamId/settings", Component: TeamSettings.Component, ErrorBoundary: TeamSettings.ErrorBoundary, loaderKey: "teamSettings" },
                    { path: "teams/:teamId/servers/:serverId", Component: ServerDetail.Component, ErrorBoundary: ServerDetail.ErrorBoundary, loaderKey: "serverDetail" },
                    { path: "permissions", Component: PermissionGroups.Component, ErrorBoundary: PermissionGroups.ErrorBoundary, loaderKey: "permissionGroups" },
                    { path: "permissions/:groupId", Component: PermissionGroupDetail.Component, ErrorBoundary: PermissionGroupDetail.ErrorBoundary, loaderKey: "permissionGroupDetail" },
                    { path: "chat-links", Component: ChatLinks.Component, ErrorBoundary: ChatLinks.ErrorBoundary, loaderKey: "chatLinks" },
                ],
            },
            { path: "*", Component: NotFound },
        ],
    },
];

/** Turns routeTree into a real RouteObject[], attaching each node's loader by loaderKey. */
export function buildRouteObjects(nodes: RouteNode[], loaders: Partial<Record<string, LoaderFunction>>): RouteObject[] {
    return nodes.map((node): RouteObject => {
        const { id, index, path, Component, ErrorBoundary, loaderKey, children } = node;
        const loader = loaderKey ? loaders[loaderKey] : undefined;
        const base = { id, Component, ErrorBoundary, loader };
        if (index) return { ...base, index: true };
        return { ...base, path, children: children ? buildRouteObjects(children, loaders) : undefined };
    });
}
