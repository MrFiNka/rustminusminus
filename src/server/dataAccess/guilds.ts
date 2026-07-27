import { PermissionFlagsBits } from "discord.js";
import { OauthModel } from "../../models/OAuth";
import { GuildModel } from "../../models/Guild";
import { UserModel } from "../../models/User";
import { TeamModel } from "../../models/Team";
import { PermissionGroupModel } from "../../models/PermissionGroup";
import { fail, ok } from "./shared";

export async function getGuildsForUser(cookieToken: string | undefined) {
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth) return fail(401, "Not logged in");
    const discordGuilds = await auth.getGuilds();
    if (!discordGuilds) return fail(401, "Can't fetch guilds");
    const managed = discordGuilds.filter(g => {
        if (!g.permissions) return false;
        return (BigInt(g.permissions) & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild);
    });
    const guildIds = new Set(managed.map(g => g.id));
    if (auth.userId) {
        const discordUserId = auth.userId.toString();
        // guilds where this user is a member of a permission group (guild-wide or team-scoped)
        const otherGroups = await PermissionGroupModel.find({ members: discordUserId, guildId: { $nin: [...guildIds] } });
        for (const g of otherGroups) guildIds.add(g.guildId);
        // guilds where this user is simply a member of a team - no permission needed to see the guild
        const userDb = await UserModel.findOne({ userId: discordUserId });
        if (userDb) {
            const teams = await TeamModel.find({ users: userDb._id });
            const teamIds = teams.map(t => t._id);
            const teamGuilds = await GuildModel.find({ teams: { $in: teamIds } });
            for (const g of teamGuilds) guildIds.add(g.guildId);
        }
    }
    const dbGuilds = await GuildModel.find({ guildId: { $in: [...guildIds] } });
    return ok(dbGuilds.map(g => ({
        guildId: g.guildId,
        name: discordGuilds.find(m => m.id === g.guildId)?.name ?? g.guildId,
    })));
}
