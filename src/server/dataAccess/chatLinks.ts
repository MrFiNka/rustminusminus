import { ChatLinkModel } from "../../models/ChatLink";
import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { requirePermission } from "../../permissions/web";
import { fail, findGuildTeam, ok } from "./shared";

async function authAndGuild(cookieToken: string | undefined, guildId: string) {
    if (!(await requirePermission(cookieToken, guildId, "chatlinks.manage"))) {
        return { ok: false as const, result: fail(401, "Not authorized") };
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return { ok: false as const, result: fail(404, "Guild not found") };
    if (!registry.isEnabledForGuild("cross-team-chat", guildId)) {
        return { ok: false as const, result: fail(403, "Cross-Team Chat module is not enabled") };
    }
    return { ok: true as const, guild };
}

export async function getChatLinksList(cookieToken: string | undefined, guildId: string) {
    const auth = await authAndGuild(cookieToken, guildId);
    if (!auth.ok) return auth.result;

    const [links, teams] = await Promise.all([
        ChatLinkModel.find({ guildId }),
        auth.guild.getTeams(),
    ]);
    const teamMap = new Map(teams.map(t => [t._id.toString(), t.name]));

    return ok({
        groups: links.map(link => ({
            id: link._id.toString(),
            name: link.name,
            teams: link.teamIds.map(id => ({ id: id.toString(), name: teamMap.get(id.toString()) ?? "Unknown" })),
        })),
        allTeams: teams.map(t => ({ id: t._id.toString(), name: t.name })),
    });
}

export async function createChatLink(cookieToken: string | undefined, guildId: string, name: string) {
    const auth = await authAndGuild(cookieToken, guildId);
    if (!auth.ok) return auth.result;

    const exists = await ChatLinkModel.findOne({ guildId, name });
    if (exists) return fail(409, "A link group with that name already exists");

    const link = await ChatLinkModel.create({ guildId, name, teamIds: [] });
    return ok({ id: link._id.toString() });
}

export async function deleteChatLink(cookieToken: string | undefined, guildId: string, linkId: string) {
    const auth = await authAndGuild(cookieToken, guildId);
    if (!auth.ok) return auth.result;

    const link = await ChatLinkModel.findOne({ _id: linkId, guildId });
    if (!link) return fail(404, "Link group not found");

    await link.deleteOne();
    return ok(null);
}

export async function addTeamToLink(cookieToken: string | undefined, guildId: string, linkId: string, teamId: string) {
    const auth = await authAndGuild(cookieToken, guildId);
    if (!auth.ok) return auth.result;

    const link = await ChatLinkModel.findOne({ _id: linkId, guildId });
    if (!link) return fail(404, "Link group not found");

    const team = await findGuildTeam(auth.guild, teamId);
    if (!team) return fail(404, "Team not found in this guild");

    const alreadyLinked = await ChatLinkModel.findOne({ guildId, teamIds: team._id });
    if (alreadyLinked) return fail(409, "This team is already in a link group");

    link.teamIds.push(team._id);
    await link.save();
    return ok(null);
}

export async function removeTeamFromLink(cookieToken: string | undefined, guildId: string, linkId: string, teamId: string) {
    const auth = await authAndGuild(cookieToken, guildId);
    if (!auth.ok) return auth.result;

    const link = await ChatLinkModel.findOne({ _id: linkId, guildId });
    if (!link) return fail(404, "Link group not found");

    const team = await findGuildTeam(auth.guild, teamId);
    if (!team) return fail(404, "Team not found in this guild");

    link.teamIds = link.teamIds.filter(id => !id.equals(team._id));
    await link.save();
    return ok(null);
}
