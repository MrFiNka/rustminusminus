import { Outlet, type LoaderFunctionArgs } from "react-router-dom";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

export interface GuildLayoutData {
    enabledModules: string[];
    isAdmin: boolean;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<GuildLayoutData> {
    const res = await fetch(`/api/guilds/${params.guildId}/enabled-modules`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load guild", { status: res.status });
    return {
        enabledModules: Array.isArray(data?.enabledModules) ? data.enabledModules : [],
        isAdmin: !!data?.isAdmin,
    };
}

export function Component() {
    return <Outlet />;
}

export const ErrorBoundary = RouteErrorBoundary;
