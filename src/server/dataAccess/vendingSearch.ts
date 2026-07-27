import { getActiveRustplus } from "../../rustplus/connections";
import { searchVendingMachines } from "../../modules/vending-search/search";
import { fail, ok, requireTeamModuleEnabled } from "./shared";

export async function searchVending(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
    query: string,
) {
    const auth = await requireTeamModuleEnabled(cookieToken, guildId, teamId, "vending-search");
    if (!auth.ok) return auth;

    const { team } = auth.data;
    if (serverId !== team.activeServerId) return fail(400, "Only the active server's vending machines can be searched");
    const conn = getActiveRustplus(team._id);
    if (!conn?.isConnected()) return fail(400, "Not connected to this server");

    const results = await searchVendingMachines(conn, query);
    return ok({ results });
}
