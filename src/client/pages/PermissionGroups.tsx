import { useState } from "react";
import { useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface PermissionGroupSummary {
    id: string;
    name: string;
    permissions: string[];
    memberCount: number;
    teamId: string | null;
    teamName: string | null;
}

interface TeamOption {
    id: string;
    name: string;
}

interface PermissionGroupsLoaderData {
    groups: PermissionGroupSummary[];
    teams: TeamOption[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<PermissionGroupsLoaderData> {
    const res = await fetch(`/api/guilds/${params.guildId}/permission-groups`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load permission groups", { status: res.status });
    return {
        groups: Array.isArray(data?.groups) ? data.groups : [],
        teams: Array.isArray(data?.teams) ? data.teams : [],
    };
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const { groups, teams } = useLoaderData() as PermissionGroupsLoaderData;
    const revalidator = useRevalidator();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [scope, setScope] = useState(""); // "" = guild-wide, otherwise a teamId
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        setError(null);
        const res = await fetch(`/api/guilds/${guildId}/permission-groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, teamId: scope || null }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setError(json.error ?? "Failed to create group");
            return;
        }
        setCreating(false);
        setName("");
        setScope("");
        revalidator.revalidate();
    };

    const cancel = () => {
        setCreating(false);
        setName("");
        setScope("");
        setError(null);
    };

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">Permissions</h1>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New group
                    </button>
                )}
            </div>
            {creating && (
                <div className="mb-6 rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit()}
                            maxLength={100}
                            placeholder="Group name"
                            disabled={submitting}
                            className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50"
                        />
                        <select
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                            disabled={submitting}
                            className="rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                        >
                            <option value="">Guild-wide</option>
                            {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                    Team: {t.name}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={submit}
                            disabled={submitting || !name.trim()}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                            {submitting ? "Creating…" : "Create"}
                        </button>
                        <button
                            onClick={cancel}
                            disabled={submitting}
                            className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:text-white disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                        A guild-wide group grants its permissions on every team. A team group grants them only on that team.
                    </p>
                    {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                </div>
            )}
            {groups.length === 0 ? (
                <EmptyState>No permission groups yet. Create one to delegate access without full admin.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Group</Th>
                        <Th>Scope</Th>
                        <Th>Permissions</Th>
                        <Th>Members</Th>
                    </Thead>
                    <Tbody>
                        {groups.map((group) => (
                            <Tr key={group.id} onClick={() => navigate(`/guild/${guildId}/permissions/${group.id}`)}>
                                <Td className="font-medium text-white">{group.name}</Td>
                                <Td className="text-neutral-400">
                                    {group.teamId ? `Team: ${group.teamName ?? group.teamId}` : "Guild-wide"}
                                </Td>
                                <Td className="text-neutral-400">
                                    {group.permissions.length > 0 ? (
                                        group.permissions.join(", ")
                                    ) : (
                                        <span className="text-neutral-600">—</span>
                                    )}
                                </Td>
                                <Td className="text-neutral-400">{group.memberCount}</Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
