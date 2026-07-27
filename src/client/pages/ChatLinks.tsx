import { useState } from "react";
import { useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { CreateEntityForm } from "../components/CreateEntityForm";
import { useCreateEntity } from "../hooks/useCreateEntity";

interface TeamRef {
    id: string;
    name: string;
}

interface ChatLinkGroup {
    id: string;
    name: string;
    teams: TeamRef[];
}

interface LoaderData {
    groups: ChatLinkGroup[];
    allTeams: TeamRef[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
    const res = await fetch(`/api/guilds/${params.guildId}/chat-links`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load chat links", { status: res.status });
    return data as LoaderData;
}

function GroupCard({ group, allTeams, allGroups, guildId, onMutate }: {
    group: ChatLinkGroup;
    allTeams: TeamRef[];
    allGroups: ChatLinkGroup[];
    guildId: string;
    onMutate: () => void;
}) {
    const allLinkedIds = new Set(allGroups.flatMap(g => g.teams.map(t => t.id)));
    const [selectedTeamId, setSelectedTeamId] = useState("");
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const availableTeams = allTeams.filter(t => !allLinkedIds.has(t.id));

    const addTeam = async () => {
        if (!selectedTeamId) return;
        setAdding(true);
        setError(null);
        const res = await fetch(`/api/guilds/${guildId}/chat-links/${group.id}/teams`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId: selectedTeamId }),
        });
        const json = await res.json();
        setAdding(false);
        if (!res.ok) { setError(json.error ?? "Failed to add team"); return; }
        setSelectedTeamId("");
        onMutate();
    };

    const removeTeam = async (teamId: string) => {
        const res = await fetch(`/api/guilds/${guildId}/chat-links/${group.id}/teams/${teamId}`, { method: "DELETE" });
        if (res.ok) onMutate();
    };

    const deleteGroup = async () => {
        setDeleting(true);
        const res = await fetch(`/api/guilds/${guildId}/chat-links/${group.id}`, { method: "DELETE" });
        setDeleting(false);
        if (res.ok) onMutate();
    };

    return (
        <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-white">{group.name}</span>
                <button
                    onClick={deleteGroup}
                    disabled={deleting}
                    className="text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
                >
                    {deleting ? "Deleting…" : "Delete group"}
                </button>
            </div>

            {group.teams.length === 0 ? (
                <p className="mb-3 text-xs text-neutral-600">No teams in this group yet.</p>
            ) : (
                <div className="mb-3 flex flex-wrap gap-2">
                    {group.teams.map(team => (
                        <span
                            key={team.id}
                            className="flex items-center gap-1 rounded-full border border-border bg-canvas px-2.5 py-0.5 text-xs text-neutral-300"
                        >
                            {team.name}
                            <button
                                onClick={() => removeTeam(team.id)}
                                className="text-neutral-500 transition-colors hover:text-red-400"
                                aria-label={`Remove ${team.name}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {availableTeams.length > 0 && (
                <div className="flex items-center gap-2">
                    <select
                        value={selectedTeamId}
                        onChange={e => setSelectedTeamId(e.target.value)}
                        disabled={adding}
                        className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                    >
                        <option value="">Add a team…</option>
                        {availableTeams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={addTeam}
                        disabled={adding || !selectedTeamId}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                        {adding ? "Adding…" : "Add"}
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
    );
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const { groups, allTeams } = useLoaderData() as LoaderData;
    const revalidator = useRevalidator();
    const create = useCreateEntity(`/api/guilds/${guildId}/chat-links`, "Failed to create group", () => revalidator.revalidate());

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">Cross-Team Chat</h1>
                {!create.creating && (
                    <button
                        onClick={() => create.setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New group
                    </button>
                )}
            </div>

            <CreateEntityForm
                creating={create.creating}
                name={create.name}
                submitting={create.submitting}
                error={create.error}
                placeholder="Group name"
                onNameChange={create.setName}
                onSubmit={create.submit}
                onCancel={create.cancel}
            />

            {groups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-neutral-500">
                    No link groups yet. Create one and add teams to relay their in-game chat to each other.
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {groups.map(group => (
                        <GroupCard
                            key={group.id}
                            group={group}
                            allTeams={allTeams}
                            allGroups={groups}
                            guildId={guildId}
                            onMutate={() => revalidator.revalidate()}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
