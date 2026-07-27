import { useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { ModuleToggleList } from "../components/ModuleToggleList";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    scope: "guild";
    enabled: boolean;
}

interface ModulesResponse {
    modules: ModuleSummary[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<ModulesResponse> {
    const res = await fetch(`/api/guilds/${params.guildId}/modules`);
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load modules", { status: res.status });
    }
    return json;
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const data = useLoaderData() as ModulesResponse;
    const revalidator = useRevalidator();

    const toggle = async (moduleId: string, enabled: boolean) => {
        await fetch(`/api/guilds/${guildId}/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
        });
        revalidator.revalidate();
    };

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <h1 className="mb-1 text-2xl font-semibold text-white">Guild Modules</h1>
            <p className="mb-6 text-sm text-neutral-500">
                Requires Manage Guild permission or the <span className="font-mono">modules.manage</span> permission group.
            </p>
            <ModuleToggleList modules={data.modules} emptyText="No guild-scoped modules registered." onToggle={toggle} />
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
