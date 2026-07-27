import { NavLink, useRouteLoaderData } from "react-router-dom";
import type { GuildLayoutData } from "../layout/GuildLayout";

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? "bg-surface text-white" : "text-neutral-400 hover:text-white"
    }`;

export const GuildSubNav = ({ guildId }: { guildId: string }) => {
    const data = useRouteLoaderData("guild") as GuildLayoutData | undefined;
    const isAdmin = data?.isAdmin ?? false;
    const crossTeamChatEnabled = data?.enabledModules.includes("cross-team-chat") ?? false;

    return (
        <nav className="mb-6 flex gap-1 border-b border-border pb-4">
            {isAdmin && (
                <NavLink to={`/guild/${guildId}/modules`} className={linkClass}>
                    Modules
                </NavLink>
            )}
            <NavLink to={`/guild/${guildId}/teams`} className={linkClass}>
                Teams
            </NavLink>
            {isAdmin && (
                <NavLink to={`/guild/${guildId}/permissions`} className={linkClass}>
                    Permissions
                </NavLink>
            )}
            {isAdmin && crossTeamChatEnabled && (
                <NavLink to={`/guild/${guildId}/chat-links`} className={linkClass}>
                    Cross-Team Chat
                </NavLink>
            )}
        </nav>
    );
};
