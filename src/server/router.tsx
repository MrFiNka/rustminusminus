import type { LoaderFunction, RouteObject } from "react-router-dom";
import { routeTree, buildRouteObjects } from "../routeTree";
import { createRootLayoutLoader } from "./loaders/rootLayout";
import { createGuildsLoader } from "./loaders/guilds";
import { createGuildLayoutLoader } from "./loaders/guildLayout";
import { createGlobalModulesLoader } from "./loaders/globalModules";
import { createModulesLoader } from "./loaders/modules";
import { createTeamsLoader } from "./loaders/teams";
import { createTeamDetailLoader } from "./loaders/teamDetail";
import { createTeamModulesLoader } from "./loaders/teamModules";
import { createTeamSettingsLoader } from "./loaders/teamSettings";
import { createTeamPermissionGroupsLoader } from "./loaders/teamPermissionGroups";
import { createServerDetailLoader } from "./loaders/serverDetail";
import { createPermissionGroupsLoader } from "./loaders/permissionGroups";
import { createPermissionGroupDetailLoader } from "./loaders/permissionGroupDetail";
import { createChatLinksLoader } from "./loaders/chatLinks";

/**
 * Builds the same route tree as src/client/router.tsx (see routeTree.tsx), but wires each route's
 * `loader` to the server-only dataAccess layer (in-process, no HTTP self-fetch) instead of the
 * client's fetch-based loader. Never imported from src/client - that boundary is what keeps
 * mongoose/discord.js out of the browser bundle.
 */
export function createServerRoutes(cookieToken: string | undefined): RouteObject[] {
    const loaders: Partial<Record<string, LoaderFunction>> = {
        rootLayout: createRootLayoutLoader(cookieToken),
        guilds: createGuildsLoader(cookieToken),
        globalModules: createGlobalModulesLoader(cookieToken),
        guildLayout: createGuildLayoutLoader(cookieToken),
        modules: createModulesLoader(cookieToken),
        teams: createTeamsLoader(cookieToken),
        teamDetail: createTeamDetailLoader(cookieToken),
        teamModules: createTeamModulesLoader(cookieToken),
        teamSettings: createTeamSettingsLoader(cookieToken),
        teamPermissionGroups: createTeamPermissionGroupsLoader(cookieToken),
        serverDetail: createServerDetailLoader(cookieToken),
        permissionGroups: createPermissionGroupsLoader(cookieToken),
        permissionGroupDetail: createPermissionGroupDetailLoader(cookieToken),
        chatLinks: createChatLinksLoader(cookieToken),
    };
    return buildRouteObjects(routeTree, loaders);
}
