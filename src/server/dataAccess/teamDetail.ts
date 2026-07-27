import { GuildModel } from "../../models/Guild";
import { ServerModel } from "../../models/Server";
import { UserModel } from "../../models/User";
import type { TeamClass } from "../../models/Team";
import { TeamInviteModel } from "../../models/TeamInvite";
import { getSessionDiscordId, getWebActor, isTeamMemberOrAdmin, requireGuildAdmin, requirePermission } from "../../permissions/web";
import { canAddTeamMembersDirectly, canInviteTeamMembers } from "../../permissions/scopes";
import { fail, ok, findGuildTeam, enabledTeamModuleIds } from "./shared";
import { getSteamName } from "../../classes/SteamApi";

interface TeamStatus {
    online: string[];
    offline: string[];
    dead: string[];
}

interface RecentChatMessage {
    name: string;
    message: string;
    time: number;
}

/** Live, best-effort team status/chat for the team page - null fields mean "not applicable or
 *  unavailable right now" (module disabled, not connected, or the Rust+ call itself failed). */
async function getLiveTeamData(team: TeamClass, enabledModules: string[]) {
    const conn = team.getActiveRustPlus();
    const connected = !!conn?.isConnected();
    let status: TeamStatus | null = null;
    let recentChat: RecentChatMessage[] | null = null;

    if (connected && conn) {
        if (enabledModules.includes("team-tracker")) {
            try {
                const info = await conn.getTeamInfo();
                status = {
                    online: info.members.filter(m => m.isOnline && m.isAlive).map(m => m.name),
                    offline: info.members.filter(m => !m.isOnline && m.isAlive).map(m => m.name),
                    dead: info.members.filter(m => !m.isAlive).map(m => m.name),
                };
            } catch { status = null; }
        }
        try {
            const chat = await conn.getTeamChat();
            recentChat = chat.slice(-20).map(m => ({ name: m.name, message: m.message, time: m.time }));
        } catch { recentChat = null; }
    }

    return { connected, status, recentChat };
}

export async function getTeamDetail(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    if (!(await isTeamMemberOrAdmin(cookieToken, guildId, team))) return fail(401, "Not authorized");
    const users = await team.getUsers();
    const discordGuild = guild.getDiscordGuild();
    const memberIds = users.map(u => u.userId);
    const members = discordGuild && memberIds.length
        ? await discordGuild.members.fetch({ user: memberIds }).catch(() => discordGuild.members.cache)
        : null;
    const steamNames = await Promise.all(users.map(u => getSteamName(u.credentials.steam_id)));
    const servers = await Promise.all(team.servers.map(async s => {
        const server = await ServerModel.findOne({ serverId: s.serverId });
        return {
            serverId: s.serverId,
            name: server?.name ?? s.serverId,
            ip: server?.ip ?? null,
            port: server?.port ?? null,
            pairedItemCounts: {
                smartSwitch: s.pairedItems.smartSwitch.length,
                smartAlarm: s.pairedItems.smartAlarm.length,
                storageMonitor: s.pairedItems.storageMonitor.length,
            },
        };
    }));
    const enabledModules = enabledTeamModuleIds(team);
    const { connected, status, recentChat } = await getLiveTeamData(team, enabledModules);

    // Viewer capabilities - drive which controls/columns the client shows.
    const isAdmin = await requireGuildAdmin(cookieToken, guildId);
    const canManageActiveServer = await requirePermission(cookieToken, guildId, "activeserver.manage", team._id);
    const canManageActiveCredential = await requirePermission(cookieToken, guildId, "activecredential.manage", team._id);
    const actor = await getWebActor(cookieToken, guildId);
    const canAddMembersDirectly = await canAddTeamMembersDirectly(guildId, actor);
    const canInviteMembers = await canInviteTeamMembers(guildId, actor, team);
    const sessionDiscordId = await getSessionDiscordId(cookieToken);
    const sessionUser = sessionDiscordId ? await UserModel.findOne({ userId: sessionDiscordId }) : null;
    const canSendChat = !!sessionUser
        && team.activeServerId != null
        && team.users.some(id => id.equals(sessionUser._id))
        && sessionUser.credentials.servers.some(s => s.serverId === team.activeServerId);

    return ok({
        id: team._id.toString(),
        name: team.name,
        isAdmin,
        canManageActiveServer,
        canManageActiveCredential,
        canAddMembersDirectly,
        canInviteMembers,
        canSendChat,
        users: users.map((u, i) => ({
            id: u._id.toString(),
            userId: u.userId,
            displayName: members?.get(u.userId)?.displayName ?? null,
            steamId: u.credentials.steam_id,
            steamName: steamNames[i],
            pairedActiveServer:
                team.activeServerId != null &&
                u.credentials.servers.some(e => e.serverId === team.activeServerId),
        })),
        activeServerId: team.activeServerId ?? null,
        activeCredentialUserId: team.activeCredentialUserId?.toString() ?? null,
        servers,
        enabledModules,
        connected,
        status,
        recentChat,
    });
}

/**
 * Candidates for the team page's add/invite picker: linked users who are members of this Discord
 * server and not already in the team, plus whichever of them already have an invite pending.
 *
 * Authorized on `canInviteTeamMembers` rather than guild-admin, since inviting is now the path most
 * people take - the team resolves first because that check is team-scoped.
 */
export async function getAddableUsers(cookieToken: string | undefined, guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    const actor = await getWebActor(cookieToken, guildId);
    if (!(await canInviteTeamMembers(guildId, actor, team))) return fail(401, "Not authorized");
    const discordGuild = guild.getDiscordGuild();
    if (!discordGuild) return fail(404, "Discord server not found");
    const currentMemberIds = new Set(team.users.map(id => id.toString()));
    const linkedUsers = await UserModel.find();
    const candidateIds = linkedUsers
        .filter(u => !currentMemberIds.has(u._id.toString()))
        .map(u => u.userId);
    // members.cache is only whatever's been seen since the bot last restarted (interactions,
    // messages, etc.) - a member who linked credentials without triggering one of those in
    // this guild's cache window won't be there. Fetch the specific candidate ids instead of
    // trusting the cache, falling back to it only if the fetch itself fails.
    const members = candidateIds.length
        ? await discordGuild.members.fetch({ user: candidateIds }).catch(() => discordGuild.members.cache)
        : discordGuild.members.cache;
    const candidates = [];
    for (const u of linkedUsers) {
        if (currentMemberIds.has(u._id.toString())) continue;
        const member = members.get(u.userId);
        if (!member) continue;
        candidates.push({ userId: u.userId, displayName: member.displayName });
    }
    // Surfaced so the picker can mark them: a candidate with an invite already out isn't a mistake
    // to block, but re-inviting silently re-DMs them, which reads as the button doing nothing.
    // Filtered on expiresAt rather than trusting the row's existence: Mongo's TTL reaper runs on a
    // ~60s cycle, so an expired invite can still be sitting there and would read as pending.
    const pending = await TeamInviteModel.find({ teamId: team._id, expiresAt: { $gt: new Date() } }, { inviteeId: 1 });
    return ok({ candidates, pendingInviteeIds: pending.map(i => i.inviteeId) });
}
