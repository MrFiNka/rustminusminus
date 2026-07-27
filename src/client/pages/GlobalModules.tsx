import { useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { ModuleToggleList } from "../components/ModuleToggleList";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    scope: "global";
    enabled: boolean;
}

interface GlobalModulesResponse {
    modules: ModuleSummary[];
}

export async function loader(_args: LoaderFunctionArgs): Promise<GlobalModulesResponse> {
    const res = await fetch("/api/modules");
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load global modules", { status: res.status });
    }
    return json;
}

export function Component() {
    const data = useLoaderData() as GlobalModulesResponse;
    const revalidator = useRevalidator();

    const toggle = async (moduleId: string, enabled: boolean) => {
        await fetch(`/api/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
        });
        revalidator.revalidate();
    };

    return (
        <div>
            <h1 className="mb-1 text-2xl font-semibold text-white">Global Modules</h1>
            <p className="mb-6 text-sm text-neutral-500">Bot-wide modules. Only the bot owner can toggle these.</p>
            <ModuleToggleList modules={data.modules} emptyText="No global modules registered." onToggle={toggle} />
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
