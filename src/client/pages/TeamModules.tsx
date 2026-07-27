import { Link, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { TeamSubNav } from "../components/TeamSubNav";
import { ModuleToggleList } from "../components/ModuleToggleList";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    scope: "team";
    enabled: boolean;
}

interface TeamModulesResponse {
    teamId: string;
    teamName: string;
    modules: ModuleSummary[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamModulesResponse> {
    const res = await fetch(`/api/guilds/${params.guildId}/teams/${params.teamId}/modules`);
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load team modules", { status: res.status });
    }
    return json;
}

export function Component() {
    const { guildId, teamId } = useParams<{ guildId: string; teamId: string }>();
    const data = useLoaderData() as TeamModulesResponse;
    const revalidator = useRevalidator();

    const toggle = async (moduleId: string, enabled: boolean) => {
        await fetch(`/api/guilds/${guildId}/teams/${teamId}/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
        });
        revalidator.revalidate();
    };

    if (!guildId || !teamId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams/${teamId}`} className="text-sm text-neutral-500 hover:text-white">
                ← {data.teamName}
            </Link>
            <h1 className="mt-2 mb-2 text-2xl font-semibold text-white">{data.teamName}</h1>
            <TeamSubNav guildId={guildId} teamId={teamId} />
            <ModuleToggleList modules={data.modules} emptyText="No team-scoped modules registered." onToggle={toggle} />
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
