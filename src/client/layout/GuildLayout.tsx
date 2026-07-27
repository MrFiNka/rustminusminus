import { Outlet, type LoaderFunctionArgs } from "react-router-dom";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

export interface GuildLayoutData {
    enabledModules: string[];
    isAdmin: boolean;
    /** May manage guild-wide permission groups - shows the guild-level Permissions tab. */
    canManageGuildPermissions: boolean;
    /** Team ids whose own permission groups this user may manage - shows each team's Permissions
     *  tab. Kept here rather than in the team loaders so one lookup serves every team page. */
    manageablePermissionTeamIds: string[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<GuildLayoutData> {
    const res = await fetch(`/api/guilds/${params.guildId}/enabled-modules`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load guild", { status: res.status });
    return {
        enabledModules: Array.isArray(data?.enabledModules) ? data.enabledModules : [],
        isAdmin: !!data?.isAdmin,
        canManageGuildPermissions: !!data?.canManageGuildPermissions,
        manageablePermissionTeamIds: Array.isArray(data?.manageablePermissionTeamIds) ? data.manageablePermissionTeamIds : [],
    };
}

export function Component() {
    return <Outlet />;
}

export const ErrorBoundary = RouteErrorBoundary;
