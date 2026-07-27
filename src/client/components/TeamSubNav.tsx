import { NavLink, useRouteLoaderData } from "react-router-dom";
import type { GuildLayoutData } from "../layout/GuildLayout";

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? "bg-surface text-white" : "text-neutral-400 hover:text-white"
    }`;

export const TeamSubNav = ({ guildId, teamId }: { guildId: string; teamId: string }) => {
    const data = useRouteLoaderData("guild") as GuildLayoutData | undefined;
    // Read off the guild layout loader rather than each team page's own data - see
    // manageablePermissionTeamIds in dataAccess/guildLayout.ts.
    const canManagePermissions = data?.manageablePermissionTeamIds.includes(teamId) ?? false;
    const canManageSettings = data?.manageableSettingsTeamIds.includes(teamId) ?? false;
    const canManageModules = data?.manageableModuleTeamIds.includes(teamId) ?? false;

    return (
        <nav className="mb-6 flex gap-1 border-b border-border pb-4">
            <NavLink to={`/guild/${guildId}/teams/${teamId}`} end className={linkClass}>
                Details
            </NavLink>
            {canManageModules && (
                <NavLink to={`/guild/${guildId}/teams/${teamId}/modules`} className={linkClass}>
                    Modules
                </NavLink>
            )}
            {canManagePermissions && (
                <NavLink to={`/guild/${guildId}/teams/${teamId}/permissions`} className={linkClass}>
                    Permissions
                </NavLink>
            )}
            {canManageSettings && (
                <NavLink to={`/guild/${guildId}/teams/${teamId}/settings`} className={linkClass}>
                    Settings
                </NavLink>
            )}
        </nav>
    );
};
