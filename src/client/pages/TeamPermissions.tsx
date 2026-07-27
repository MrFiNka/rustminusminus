import { useState } from "react";
import { Link, useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { TeamSubNav } from "../components/TeamSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface TeamPermissionGroup {
    id: string;
    name: string;
    permissions: string[];
    memberCount: number;
}

interface GrantablePermission {
    id: string;
    label: string;
}

interface TeamPermissionsLoaderData {
    teamName: string;
    groups: TeamPermissionGroup[];
    grantable: GrantablePermission[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamPermissionsLoaderData> {
    const res = await fetch(`/api/guilds/${params.guildId}/teams/${params.teamId}/permission-groups`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load this team's permissions", { status: res.status });
    return {
        teamName: typeof data?.teamName === "string" ? data.teamName : "",
        groups: Array.isArray(data?.groups) ? data.groups : [],
        grantable: Array.isArray(data?.grantable) ? data.grantable : [],
    };
}

export function Component() {
    const { guildId, teamId } = useParams<{ guildId: string; teamId: string }>();
    const navigate = useNavigate();
    const { teamName, groups, grantable } = useLoaderData() as TeamPermissionsLoaderData;
    const revalidator = useRevalidator();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        setError(null);
        // Same endpoint the guild screen uses - the teamId in the body is what scopes it here.
        const res = await fetch(`/api/guilds/${guildId}/permission-groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, teamId }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setError(json.error ?? "Failed to create group");
            return;
        }
        setCreating(false);
        setName("");
        revalidator.revalidate();
    };

    const cancel = () => {
        setCreating(false);
        setName("");
        setError(null);
    };

    if (!guildId || !teamId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams/${teamId}`} className="text-sm text-neutral-500 hover:text-white">
                ← {teamName}
            </Link>
            <h1 className="mt-2 mb-2 text-2xl font-semibold text-white">{teamName}</h1>
            <TeamSubNav guildId={guildId} teamId={teamId} />
            <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Permissions</h2>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New group
                    </button>
                )}
            </div>
            <p className="mb-6 text-sm text-neutral-500">
                Groups here grant only on {teamName || "this team"}. Server-wide grants live on the server&apos;s
                Permissions tab.
            </p>
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
                    {grantable.length > 0 && (
                        <p className="mt-2 text-xs text-neutral-500">
                            Can grant: {grantable.map((p) => p.label).join(", ")}.
                        </p>
                    )}
                    {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                </div>
            )}
            {groups.length === 0 ? (
                <EmptyState>
                    No groups for this team yet. Create one to let a member manage this team without giving them
                    Manage Server.
                </EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Group</Th>
                        <Th>Permissions</Th>
                        <Th>Members</Th>
                    </Thead>
                    <Tbody>
                        {groups.map((group) => (
                            <Tr
                                key={group.id}
                                onClick={() => navigate(`/guild/${guildId}/teams/${teamId}/permissions/${group.id}`)}
                            >
                                <Td className="font-medium text-white">{group.name}</Td>
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
