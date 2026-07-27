import { useState } from "react";
import { Link, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { Settings, Terminal } from "lucide-react";
import { GuildSubNav } from "../components/GuildSubNav";
import { TeamSubNav } from "../components/TeamSubNav";
import { SectionCard } from "../components/SectionCard";
import { ModuleSettingsForm, type SettingsModule } from "../components/ModuleSettingsForm";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface TeamSettingsResponse {
    teamId: string;
    teamName: string;
    chatPrefix: string;
    modules: SettingsModule[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamSettingsResponse> {
    const res = await fetch(`/api/guilds/${params.guildId}/teams/${params.teamId}/settings`);
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load settings", { status: res.status });
    }
    return json;
}

export function Component() {
    const { guildId, teamId } = useParams<{ guildId: string; teamId: string }>();
    const data = useLoaderData() as TeamSettingsResponse;
    const revalidator = useRevalidator();

    const [prefix, setPrefix] = useState(data.chatPrefix);
    const [prefixSaving, setPrefixSaving] = useState(false);
    const [prefixError, setPrefixError] = useState<string | null>(null);
    const [prefixSaved, setPrefixSaved] = useState(false);

    if (!guildId || !teamId) return null;

    const savePrefix = async () => {
        setPrefixSaving(true);
        setPrefixError(null);
        setPrefixSaved(false);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatPrefix: prefix }),
        });
        const json = await res.json().catch(() => ({}));
        setPrefixSaving(false);
        if (!res.ok) {
            setPrefixError(json.error ?? "Failed to save");
            return;
        }
        setPrefixSaved(true);
        revalidator.revalidate();
    };

    const saveModule = async (moduleId: string, values: Record<string, unknown>) => {
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/modules/${moduleId}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: values }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) revalidator.revalidate();
        return { ok: res.ok, error: json.error as string | undefined };
    };

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams/${teamId}`} className="text-sm text-neutral-500 hover:text-white">
                ← {data.teamName}
            </Link>
            <h1 className="mt-2 mb-2 text-2xl font-semibold text-white">{data.teamName}</h1>
            <TeamSubNav guildId={guildId} teamId={teamId} />

            <div className="mb-6">
                <SectionCard icon={<Terminal className="h-4 w-4" />} title="In-game chat prefix">
                    <div className="flex flex-col gap-2 p-4">
                        <p className="text-xs text-neutral-500">
                            Character(s) players type before a chat command (e.g. <span className="font-mono">{prefix || "!"}pop</span>).
                        </p>
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                value={prefix}
                                maxLength={3}
                                onChange={(e) => { setPrefix(e.target.value); setPrefixSaved(false); }}
                                disabled={prefixSaving}
                                className="w-24 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                            />
                            <button
                                onClick={savePrefix}
                                disabled={prefixSaving}
                                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                            >
                                {prefixSaving ? "Saving…" : "Save"}
                            </button>
                            {prefixError && <span className="text-xs text-red-400">{prefixError}</span>}
                            {prefixSaved && !prefixError && <span className="text-xs text-emerald-400">Saved</span>}
                        </div>
                    </div>
                </SectionCard>
            </div>

            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Module settings</h2>
            {data.modules.length === 0 ? (
                <p className="text-sm text-neutral-500">No modules have configurable settings.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {data.modules.map((mod) => (
                        <SectionCard key={mod.id} icon={<Settings className="h-4 w-4" />} title={mod.name}>
                            <ModuleSettingsForm module={mod} onSave={saveModule} />
                        </SectionCard>
                    ))}
                </div>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
