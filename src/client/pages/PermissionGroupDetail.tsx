import { useState } from "react";
import { Link, useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { TeamSubNav } from "../components/TeamSubNav";
import { EmptyState } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface PermissionDefinition {
    id: string;
    label: string;
    description: string;
    status: "enforced" | "reserved";
}

interface GroupDiscordUser {
    userId: string;
    displayName: string;
}

interface PermissionGroupDetailResponse {
    id: string;
    name: string;
    permissions: string[];
    teamId: string | null;
    teamName: string | null;
    discordUsers: GroupDiscordUser[];
}

interface AssignableMember {
    userId: string;
    displayName: string;
}

interface PermissionGroupDetailLoaderData {
    group: PermissionGroupDetailResponse;
    definitions: PermissionDefinition[];
    assignableMembers: AssignableMember[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<PermissionGroupDetailLoaderData> {
    const { guildId, groupId } = params;
    const [groupRes, definitionsRes, assignableRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}/permission-groups/${groupId}`),
        fetch(`/api/guilds/${guildId}/permission-groups/${groupId}/definitions`),
        fetch(`/api/guilds/${guildId}/permission-groups/${groupId}/assignable-members`),
    ]);
    const groupJson = await groupRes.json();
    if (!groupRes.ok || typeof groupJson.id !== "string") {
        throw new Response(groupJson?.error ?? "Failed to load this permission group", { status: groupRes.status });
    }
    const definitionsJson = await definitionsRes.json().catch(() => null);
    const assignableJson = await assignableRes.json().catch(() => null);
    return {
        group: groupJson,
        definitions: Array.isArray(definitionsJson) ? definitionsJson : [],
        assignableMembers: Array.isArray(assignableJson) ? assignableJson : [],
    };
}

export function Component() {
    // teamId is present only on the team-scoped route (teams/:teamId/permissions/:groupId). It
    // decides which sub-nav and back link this page wears - the group data itself is identical.
    const { guildId, teamId, groupId } = useParams<{ guildId: string; teamId?: string; groupId: string }>();
    const navigate = useNavigate();
    const { group: data, definitions, assignableMembers } = useLoaderData() as PermissionGroupDetailLoaderData;
    const revalidator = useRevalidator();
    const [selectedUserId, setSelectedUserId] = useState("");
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const togglePermission = async (permissionId: string, enabled: boolean) => {
        const permissions = enabled
            ? [...data.permissions, permissionId]
            : data.permissions.filter((p) => p !== permissionId);
        setPending(permissionId);
        await fetch(`/api/guilds/${guildId}/permission-groups/${groupId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permissions }),
        });
        setPending(null);
        revalidator.revalidate();
    };

    const addMember = async () => {
        if (!selectedUserId) return;
        setPending("add-member");
        setError(null);
        const res = await fetch(`/api/guilds/${guildId}/permission-groups/${groupId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: selectedUserId }),
        });
        const json = await res.json();
        setPending(null);
        if (!res.ok) {
            setError(json.error ?? "Failed to add member");
            return;
        }
        setSelectedUserId("");
        revalidator.revalidate();
    };

    const removeMember = async (userId: string) => {
        setPending(userId);
        await fetch(`/api/guilds/${guildId}/permission-groups/${groupId}/members/${userId}`, { method: "DELETE" });
        setPending(null);
        revalidator.revalidate();
    };

    const listPath = teamId ? `/guild/${guildId}/teams/${teamId}/permissions` : `/guild/${guildId}/permissions`;

    const deleteGroup = async () => {
        if (!confirm(`Delete permission group "${data.name}"?`)) return;
        await fetch(`/api/guilds/${guildId}/permission-groups/${groupId}`, { method: "DELETE" });
        navigate(listPath);
    };

    if (!guildId || !groupId) return null;

    const enforced = definitions.filter((d) => d.status === "enforced");
    const reserved = definitions.filter((d) => d.status === "reserved");

    return (
        <div>
            {/* The guild nav stays on team-scoped routes too - every other team page keeps it, and
                dropping it stranded this page with no way back up to the guild. */}
            <GuildSubNav guildId={guildId} />
            {teamId && <TeamSubNav guildId={guildId} teamId={teamId} />}
            <Link to={listPath} className="text-sm text-neutral-500 hover:text-white">
                ← Permissions
            </Link>
            <div className="mt-2 mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
                    <p className="mt-0.5 text-xs text-neutral-500">
                        {data.teamId
                            ? `Grants on ${data.teamName ?? "this team"} only`
                            : "Server-wide — grants on every team"}
                    </p>
                </div>
                <button
                    onClick={deleteGroup}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:border-red-400 hover:text-red-400"
                >
                    Delete group
                </button>
            </div>

            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Permissions</h2>
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                {enforced.map((def) => {
                    const checked = data.permissions.includes(def.id);
                    return (
                        <label key={def.id} className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={pending === def.id}
                                onChange={(e) => togglePermission(def.id, e.target.checked)}
                                className="mt-1"
                            />
                            <div>
                                <div className="text-sm font-medium text-white">{def.label}</div>
                                <div className="text-xs text-neutral-500">{def.description}</div>
                            </div>
                        </label>
                    );
                })}
            </div>

            {reserved.length > 0 && (
                <>
                    <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-600">
                        Reserved (coming soon)
                    </h2>
                    <div className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 opacity-50">
                        {reserved.map((def) => (
                            <label key={def.id} className="flex items-start gap-3">
                                <input type="checkbox" checked={false} disabled className="mt-1" />
                                <div>
                                    <div className="text-sm font-medium text-white">{def.label}</div>
                                    <div className="text-xs text-neutral-500">{def.description}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </>
            )}

            <h2 className="mt-8 mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
                Members
            </h2>
            <p className="mb-3 text-xs text-neutral-500">
                Members here hold this group&apos;s permissions across the web dashboard, Discord commands, and
                in-game chat. Membership is managed here (or with the <span className="font-mono">/permissions</span> command) — no Discord role required.
            </p>
            {data.discordUsers.length === 0 ? (
                <EmptyState>No members assigned yet.</EmptyState>
            ) : (
                <div className="mb-3 flex flex-col gap-2">
                    {data.discordUsers.map((u) => (
                        <div
                            key={u.userId}
                            className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
                        >
                            <span className="text-sm text-white">{u.displayName}</span>
                            <button
                                onClick={() => removeMember(u.userId)}
                                disabled={pending === u.userId}
                                className="text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                {assignableMembers.length === 0 ? (
                    <p className="text-xs text-neutral-500">No more members available to add.</p>
                ) : (
                    <div className="flex items-center gap-2">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            disabled={pending === "add-member"}
                            className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                        >
                            <option value="">Select a user to add…</option>
                            {assignableMembers.map((u) => (
                                <option key={u.userId} value={u.userId}>
                                    {u.displayName}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={addMember}
                            disabled={pending === "add-member" || !selectedUserId}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                            {pending === "add-member" ? "Adding…" : "Add"}
                        </button>
                    </div>
                )}
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
