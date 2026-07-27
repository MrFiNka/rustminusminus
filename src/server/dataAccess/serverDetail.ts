import { GuildModel } from "../../models/Guild";
import { ServerModel } from "../../models/Server";
import { isTeamMemberOrAdmin, requirePermission } from "../../permissions/web";
import { getServerSnapshot } from "../../rustplus/serverSnapshot";
import { fail, ok, findGuildTeam, enabledTeamModuleIds } from "./shared";

export async function getServerDetail(cookieToken: string | undefined, guildId: string, teamId: string, serverId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return fail(401, "Not authorized");
    const teamServer = team.servers.find(s => s.serverId === serverId);
    if (!teamServer) return fail(404, "This team hasn't paired with that server");
    const serverDb = await ServerModel.findOne({ serverId });
    const isActive = serverId === team.activeServerId;
    // only auto-fetch live data for the active server (reuses the open connection, fast) -
    // any other server requires an explicit /ping since that can be slow or fail
    const live = isActive ? await getServerSnapshot(team, serverId) : null;
    return ok({
        serverId,
        name: serverDb?.name ?? serverId,
        img: serverDb?.img ?? null,
        url: serverDb?.url ?? null,
        ip: serverDb?.ip ?? null,
        port: serverDb?.port ?? null,
        isActive,
        enabledModules: enabledTeamModuleIds(team),
        // Drives whether the market panel offers watch controls. The write routes enforce this
        // independently - this only decides what's worth showing.
        canManageWatches: await requirePermission(cookieToken, guildId, "vending.watch", team._id),
        pairedItems: {
            smartSwitch: teamServer.pairedItems.smartSwitch.map(s => s.id),
            smartAlarm: teamServer.pairedItems.smartAlarm.map(a => a.id),
            storageMonitor: teamServer.pairedItems.storageMonitor.map(s => s.id),
        },
        live: live && !("error" in live) ? live : null,
        liveError: live && "error" in live ? live.error : null,
    });
}
