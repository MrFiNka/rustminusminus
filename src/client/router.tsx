import type { LoaderFunction, RouteObject } from "react-router-dom";
import { routeTree, buildRouteObjects } from "../routeTree";
import * as Guilds from "./pages/Guilds";
import * as GlobalModules from "./pages/GlobalModules";
import * as GuildLayout from "./layout/GuildLayout";
import * as Modules from "./pages/Modules";
import * as Teams from "./pages/Teams";
import * as TeamDetail from "./pages/TeamDetail";
import * as TeamModules from "./pages/TeamModules";
import * as TeamSettings from "./pages/TeamSettings";
import * as TeamPermissions from "./pages/TeamPermissions";
import * as ServerDetail from "./pages/ServerDetail";
import * as PermissionGroups from "./pages/PermissionGroups";
import * as PermissionGroupDetail from "./pages/PermissionGroupDetail";
import * as ChatLinks from "./pages/ChatLinks";

const loaders: Partial<Record<string, LoaderFunction>> = {
    guilds: Guilds.loader,
    globalModules: GlobalModules.loader,
    guildLayout: GuildLayout.loader,
    modules: Modules.loader,
    teams: Teams.loader,
    teamDetail: TeamDetail.loader,
    teamModules: TeamModules.loader,
    teamSettings: TeamSettings.loader,
    teamPermissionGroups: TeamPermissions.loader,
    serverDetail: ServerDetail.loader,
    permissionGroups: PermissionGroups.loader,
    permissionGroupDetail: PermissionGroupDetail.loader,
    chatLinks: ChatLinks.loader,
};

export const routes: RouteObject[] = buildRouteObjects(routeTree, loaders);
