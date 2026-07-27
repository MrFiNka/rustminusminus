import { useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { CreateEntityForm } from "../components/CreateEntityForm";
import { useCreateEntity } from "../hooks/useCreateEntity";

interface TeamSummary {
    id: string;
    name: string;
    memberCount: number;
    activeServerId: string | null;
    activeServerName: string | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamSummary[]> {
    const res = await fetch(`/api/guilds/${params.guildId}/teams`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load teams", { status: res.status });
    return Array.isArray(data) ? data : [];
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const teams = useLoaderData() as TeamSummary[];
    const revalidator = useRevalidator();
    const create = useCreateEntity(`/api/guilds/${guildId}/teams`, "Failed to create team", () => revalidator.revalidate());

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">Teams</h1>
                {!create.creating && (
                    <button
                        onClick={() => create.setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New team
                    </button>
                )}
            </div>
            <CreateEntityForm
                creating={create.creating}
                name={create.name}
                submitting={create.submitting}
                error={create.error}
                placeholder="Team name"
                hint="Provisioning the team's Discord role and channels, this can take a few seconds…"
                onNameChange={create.setName}
                onSubmit={create.submit}
                onCancel={create.cancel}
            />
            {teams.length === 0 ? (
                <EmptyState>No teams yet. Create one with the /team create Discord command.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Team</Th>
                        <Th>Members</Th>
                        <Th>Active server</Th>
                    </Thead>
                    <Tbody>
                        {teams.map((team) => (
                            <Tr key={team.id} onClick={() => navigate(`/guild/${guildId}/teams/${team.id}`)}>
                                <Td className="font-medium text-white">{team.name}</Td>
                                <Td className="text-neutral-400">{team.memberCount}</Td>
                                <Td className="text-neutral-400">
                                    {team.activeServerName ?? <span className="text-neutral-600">—</span>}
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
