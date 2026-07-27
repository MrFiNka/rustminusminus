import { GuildModel } from "../../models/Guild";
import { isTeamMemberOrAdmin } from "../../permissions/web";
import { getServerMapMeta } from "../../rustplus/serverSnapshot";
import { fail, ok, findGuildTeam } from "./shared";

/**
 * Map geometry + monuments for one of a team's paired servers - the data the interactive overlay
 * needs on top of the JPEG.
 *
 * Auth matches the map *image* route (team member or guild admin, no module gate): this is the same
 * map, just described rather than drawn, so gating it differently would be arbitrary. Works for any
 * paired server, not only the active one - `getServerMapMeta` opens an ephemeral connection when
 * needed, which is what lets a non-active server still render a zoomable map with grid and monuments.
 */
export async function getMapMeta(cookieToken: string | undefined, guildId: string, teamId: string, serverId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return fail(401, "Not authorized");
    if (!team.servers.some(s => s.serverId === serverId)) return fail(404, "This team hasn't paired with that server");

    const meta = await getServerMapMeta(team, serverId);
    if ("error" in meta) return fail(400, meta.error);
    return ok(meta);
}
