import type { LoaderFunctionArgs } from "react-router-dom";
import { getTeamDetail, getAddableUsers } from "../dataAccess/teamDetail";

export function createTeamDetailLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const [teamResult, addableResult] = await Promise.all([
            getTeamDetail(cookieToken, params.guildId!, params.teamId!),
            getAddableUsers(cookieToken, params.guildId!, params.teamId!),
        ]);
        if (!teamResult.ok) throw new Response(teamResult.error, { status: teamResult.status });
        return {
            team: teamResult.data,
            addableUsers: addableResult.ok ? addableResult.data.candidates : [],
            pendingInviteeIds: addableResult.ok ? addableResult.data.pendingInviteeIds : [],
        };
    };
}
