import Elysia from "elysia";
import { Types } from "mongoose";
import { getActiveRustplus } from "../../rustplus/connections";
import { getServerMap, getServerSnapshot, invalidateServerSnapshot } from "../../rustplus/serverSnapshot";
import type { PairedItemKind } from "../../rustplus/pairedItems";
import { getTeamsList } from "../../server/dataAccess/teams";
import { getTeamDetail, getAddableUsers } from "../../server/dataAccess/teamDetail";
import { getServerDetail } from "../../server/dataAccess/serverDetail";
import { renameDevice, removeDevice } from "../../server/dataAccess/deviceActions";
import { listMarket } from "../../server/dataAccess/vendingSearch";
import { getMapMeta } from "../../server/dataAccess/serverMap";
import {
    createVendingWatch,
    deleteVendingWatch,
    listVendingWatches,
    setVendingWatchEnabled,
    type WatchInput,
} from "../../server/dataAccess/vendingWatches";
import { requireTeamModuleAccess } from "../../server/dataAccess/shared";
import { getSessionDiscordId, requirePermission } from "../../permissions/web";
import { canAddTeamMembersDirectly, canInviteTeamMembers } from "../../permissions/scopes";
import { sendTeamInvite } from "../../discord/teamInvites";
import { sessionPlugin } from "./session";
import { resolveAdminGuild, resolveMemberTeam, resolveTeamForMemberAction } from "./shared";

export const teamsRoutes = new Elysia({ name: "teamsRoutes" })
    .use(sessionPlugin)
    .get("guilds/:guildId/teams", async ({ params, cookieToken, set }) => {
        const result = await getTeamsList(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .get("guilds/:guildId/teams/:teamId", async ({ params, cookieToken, set }) => {
        const result = await getTeamDetail(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/teams", async ({ params, body, cookieToken, set }) => {
        const guildResult = await resolveAdminGuild(cookieToken as string | undefined, params.guildId as string);
        if (!guildResult.ok) { set.status = guildResult.status; return { error: guildResult.error }; }
        const guild = guildResult.data;
        const name = (body as { name?: string }).name?.trim();
        if (!name) { set.status = 400; return { error: "Team name is required" }; }
        if (await guild.findTeamByName(name)) { set.status = 409; return { error: "A team with that name already exists" }; }
        // Same as /team create: whoever creates the team owns it, which is what lets them manage its
        // permission groups without being a guild admin.
        const ownerId = await getSessionDiscordId(cookieToken as string | undefined);
        const created = await guild.createTeam(name, ownerId ?? undefined);
        if (!created) {
            set.status = 500;
            return { error: "Failed to create team — check the bot has Administrator permission in this server" };
        }
        return { ok: true };
    })
    .patch("guilds/:guildId/teams/:teamId/active-server", async ({ params, body, cookieToken, set }) => {
        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "activeserver.manage", params.teamId as string))) {
            set.status = 401; return { error: "Not authorized" };
        }
        const result = await resolveMemberTeam(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const { serverId } = body as { serverId: string };
        const changeResult = await result.data.team.changeActiveServer(serverId);
        if (changeResult === false) { set.status = 400; return { error: "Active credential user has no access to that server" }; }
        if (changeResult === null) { set.status = 400; return { error: "No active credential user set for this team" }; }
        return { ok: true };
    })
    .patch("guilds/:guildId/teams/:teamId/active-credential-user", async ({ params, body, cookieToken, set }) => {
        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "activecredential.manage", params.teamId as string))) {
            set.status = 401; return { error: "Not authorized" };
        }
        const result = await resolveMemberTeam(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const { userId } = body as { userId: string };
        const changeResult = await result.data.team.changeActiveCredentialUser(new Types.ObjectId(userId));
        if (changeResult === false) { set.status = 400; return { error: "That user has no credentials for the active server" }; }
        if (changeResult === null) { set.status = 400; return { error: "Could not resolve active credential user" }; }
        return { ok: true };
    })
    .get("guilds/:guildId/teams/:teamId/addable-users", async ({ params, cookieToken, set }) => {
        const result = await getAddableUsers(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    // Adding with no invite for the user to accept - its own guild-wide permission, deliberately
    // narrower than the invite route below. The client hides the button, but this is the gate.
    .post("guilds/:guildId/teams/:teamId/members", async ({ params, body, cookieToken, set }) => {
        const result = await resolveTeamForMemberAction(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const { guild, team, actor } = result.data;
        if (!(await canAddTeamMembersDirectly(guild.guildId, actor))) { set.status = 401; return { error: "Not authorized" }; }
        const { userId } = body as { userId: string };
        const addResult = await team.addMember(userId);
        if (!addResult.ok) { set.status = 400; return { error: addResult.error }; }
        return { ok: true };
    })
    .post("guilds/:guildId/teams/:teamId/invites", async ({ params, body, cookieToken, set }) => {
        const result = await resolveTeamForMemberAction(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const { guild, team, actor } = result.data;
        if (!(await canInviteTeamMembers(guild.guildId, actor, team))) { set.status = 401; return { error: "Not authorized" }; }
        if (!actor.discordUserId) { set.status = 401; return { error: "Not authorized" }; }
        const { userId } = body as { userId: string };
        const inviteResult = await sendTeamInvite(guild, team, actor.discordUserId, userId);
        if (!inviteResult.ok) { set.status = 400; return { error: inviteResult.error }; }
        return { ok: true };
    })
    .get("guilds/:guildId/teams/:teamId/servers/:serverId", async ({ params, cookieToken, set }) => {
        const result = await getServerDetail(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/teams/:teamId/servers/:serverId/ping", async ({ params, cookieToken, set }) => {
        const result = await resolveMemberTeam(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const snapshotResult = await getServerSnapshot(result.data.team, params.serverId as string);
        if ("error" in snapshotResult) { set.status = 400; return { error: snapshotResult.error }; }
        return snapshotResult;
    })
    .get("guilds/:guildId/teams/:teamId/servers/:serverId/map", async ({ params, cookieToken, set }) => {
        const result = await resolveMemberTeam(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const mapResult = await getServerMap(result.data.team, params.serverId as string);
        if ("error" in mapResult) { set.status = 400; return { error: mapResult.error }; }
        // the map only changes on wipe - let the browser skip refetching it entirely for a while,
        // overriding the global no-store default set in onRequest
        set.headers["Cache-Control"] = "private, max-age=300";
        return new Response(Buffer.from(mapResult), { headers: { "Content-Type": "image/jpeg" } });
    })
    // Geometry + monuments for the interactive overlay. Shares the map image's cache entry server-
    // side, and is wipe-stable, so it gets the same browser cache window as the image it describes.
    .get("guilds/:guildId/teams/:teamId/servers/:serverId/map-meta", async ({ params, cookieToken, set }) => {
        const result = await getMapMeta(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        set.headers["Cache-Control"] = "private, max-age=300";
        return result.data;
    })
    .post("guilds/:guildId/teams/:teamId/servers/:serverId/entities/:entityId/toggle", async ({ params, body, cookieToken, set }) => {
        const result = await requireTeamModuleAccess(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            "smart-switches",
            "switches.toggle",
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        const { team } = result.data;
        if (params.serverId !== team.activeServerId) {
            set.status = 400;
            return { error: "Only the active server's switches can be controlled" };
        }
        const conn = getActiveRustplus(team._id);
        if (!conn) { set.status = 400; return { error: "Not connected to this server" }; }
        const { value } = body as { value: boolean };
        await conn.setEntityValue(Number(params.entityId), value);
        invalidateServerSnapshot(team._id, params.serverId as string);
        return { ok: true };
    })
    .patch("guilds/:guildId/teams/:teamId/servers/:serverId/entities/:entityId", async ({ params, body, cookieToken, set }) => {
        const { kind, name } = body as { kind: PairedItemKind; name?: string };
        if (!["smartSwitch", "smartAlarm", "storageMonitor"].includes(kind)) {
            set.status = 400;
            return { error: "Invalid device kind" };
        }
        const trimmed = name?.trim();
        if (!trimmed) { set.status = 400; return { error: "Name is required" }; }
        const result = await renameDevice(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
            kind,
            params.entityId as string,
            trimmed,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    .delete("guilds/:guildId/teams/:teamId/servers/:serverId/entities/:entityId", async ({ params, query, cookieToken, set }) => {
        const kind = query.kind as PairedItemKind;
        if (!["smartSwitch", "smartAlarm", "storageMonitor"].includes(kind)) {
            set.status = 400;
            return { error: "Invalid device kind" };
        }
        const result = await removeDevice(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
            kind,
            params.entityId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    // The whole market in one payload - the browser filters and sorts it client-side. Replaces the
    // old POST /vending-search, which took a query and returned pre-rendered sentences.
    .get("guilds/:guildId/teams/:teamId/servers/:serverId/market", async ({ params, cookieToken, set }) => {
        const result = await listMarket(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    // Market watches. Listing is a read (team members), while create/toggle/delete are gated on
    // `vending.watch` inside the data-access layer - creating one makes the bot post to Discord.
    .get("guilds/:guildId/teams/:teamId/servers/:serverId/vending-watches", async ({ params, cookieToken, set }) => {
        const result = await listVendingWatches(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/teams/:teamId/servers/:serverId/vending-watches", async ({ params, body, cookieToken, set }) => {
        const result = await createVendingWatch(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.serverId as string,
            body as WatchInput,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/teams/:teamId/vending-watches/:watchId", async ({ params, body, cookieToken, set }) => {
        const { enabled } = body as { enabled?: boolean };
        if (typeof enabled !== "boolean") { set.status = 400; return { error: "enabled must be true or false" }; }
        const result = await setVendingWatchEnabled(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.watchId as string,
            enabled,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .delete("guilds/:guildId/teams/:teamId/vending-watches/:watchId", async ({ params, cookieToken, set }) => {
        const result = await deleteVendingWatch(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            params.watchId as string,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    });
