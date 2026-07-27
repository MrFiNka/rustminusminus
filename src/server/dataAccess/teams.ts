import { GuildModel } from "../../models/Guild";
import { ServerModel } from "../../models/Server";
import { UserModel } from "../../models/User";
import { canViewGuild, getSessionDiscordId, requireGuildAdmin } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getTeamsList(cookieToken: string | undefined, guildId: string) {
    if (!(await canViewGuild(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    let teams = await guild.getTeams();

    // Non-admins only see the teams they're a member of.
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        const discordId = await getSessionDiscordId(cookieToken);
        const userDb = discordId ? await UserModel.findOne({ userId: discordId }) : null;
        teams = userDb ? teams.filter(t => t.users.some(id => id.equals(userDb._id))) : [];
    }

    const data = await Promise.all(teams.map(async t => {
        const activeServer = t.activeServerId ? await ServerModel.findOne({ serverId: t.activeServerId }) : null;
        return {
            id: t._id.toString(),
            name: t.name,
            memberCount: t.users.length,
            activeServerId: t.activeServerId ?? null,
            activeServerName: activeServer?.name ?? t.activeServerId ?? null,
        };
    }));
    return ok(data);
}
