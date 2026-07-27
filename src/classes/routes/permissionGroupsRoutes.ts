import Elysia from "elysia";
import type { Types } from "mongoose";
import { PermissionGroupModel, createPermissionGroup } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { findGuildTeam, resolveManageablePermissionGroup } from "../../server/dataAccess/shared";
import { getWebActor } from "../../permissions/web";
import { canManageGuildPermissionGroups, canManageTeamPermissionGroups } from "../../permissions/scopes";
import { grantablePermissions } from "../../permissions/definitions";
import type { PermissionId } from "../../permissions/definitions";
import { getPermissionGroupsList } from "../../server/dataAccess/permissionGroups";
import { getTeamPermissionGroups } from "../../server/dataAccess/teamPermissionGroups";
import { getPermissionGroupDetail, getPermissionDefinitions, getAssignableMembers } from "../../server/dataAccess/permissionGroupDetail";
import { sessionPlugin } from "./session";

export const permissionGroupsRoutes = new Elysia({ name: "permissionGroupsRoutes" })
    .use(sessionPlugin)
    // Per-group, not per-guild: which permissions a group may carry depends on its scope.
    .get("guilds/:guildId/permission-groups/:groupId/definitions", async ({ params, cookieToken, set }) => {
        const result = await getPermissionDefinitions(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .get("guilds/:guildId/permission-groups", async ({ params, cookieToken, set }) => {
        const result = await getPermissionGroupsList(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    // The team's own Permissions tab. Creation still goes through POST permission-groups with a
    // teamId - one code path for both scopes, authorized per scope there.
    .get("guilds/:guildId/teams/:teamId/permission-groups", async ({ params, cookieToken, set }) => {
        const result = await getTeamPermissionGroups(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/permission-groups", async ({ params, body, cookieToken, set }) => {
        const guildId = params.guildId as string;
        const { name: rawName, teamId } = body as { name?: string; teamId?: string | null };
        const name = rawName?.trim();
        if (!name) { set.status = 400; return { error: "Group name is required" }; }
        const guild = await GuildModel.findOne({ guildId });
        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
        const actor = await getWebActor(cookieToken as string | undefined, guildId);
        // The requested scope decides which check applies - creating a guild-wide group is a
        // guild-level action even for someone who owns every team in it.
        let teamObjectId: Types.ObjectId | null = null;
        if (teamId) {
            const team = await findGuildTeam(guild, teamId);
            if (!team) { set.status = 400; return { error: "That team isn't in this guild" }; }
            if (!(await canManageTeamPermissionGroups(guildId, actor, team))) {
                set.status = 401;
                return { error: "Not authorized" };
            }
            teamObjectId = team._id;
        } else if (!(await canManageGuildPermissionGroups(guildId, actor))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const existing = await PermissionGroupModel.findOne({ guildId, name, teamId: teamObjectId });
        if (existing) { set.status = 409; return { error: "A permission group with that name already exists in this scope" }; }
        const created = await createPermissionGroup(guildId, name, teamObjectId);
        if (!created) { set.status = 500; return { error: "Failed to create the permission group" }; }
        return { ok: true, id: created._id.toString() };
    })
    .get("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
        const result = await getPermissionGroupDetail(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/permission-groups/:groupId", async ({ params, body, cookieToken, set }) => {
        const resolved = await resolveManageablePermissionGroup(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }
        const group = resolved.data;
        const { name, permissions } = body as { name?: string; permissions?: PermissionId[] };
        if (name !== undefined) {
            const trimmed = name.trim();
            if (!trimmed) { set.status = 400; return { error: "Group name is required" }; }
            group.name = trimmed;
        }
        if (permissions !== undefined) {
            // Scoped to the group, not just "every enforced permission": a team group must not be
            // able to carry guild-level permissions its owner has no standing to hand out.
            const validIds = new Set(grantablePermissions(!!group.teamId).map(p => p.id));
            group.permissions = permissions.filter(p => validIds.has(p));
        }
        await group.save();
        return { ok: true };
    })
    .delete("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
        const resolved = await resolveManageablePermissionGroup(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        // Unlike before, a missing group 404s instead of reporting success: the old blanket-admin
        // version couldn't tell the two apart, but the scoped check has to load the group anyway.
        if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }
        await resolved.data.deleteOne();
        return { ok: true };
    })
    .get("guilds/:guildId/permission-groups/:groupId/assignable-members", async ({ params, cookieToken, set }) => {
        const result = await getAssignableMembers(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/permission-groups/:groupId/members", async ({ params, body, cookieToken, set }) => {
        const resolved = await resolveManageablePermissionGroup(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }
        const { userId } = body as { userId: string };
        const result = await resolved.data.addMember(userId);
        if (!result.ok) { set.status = 400; return { error: result.error }; }
        return { ok: true };
    })
    .delete("guilds/:guildId/permission-groups/:groupId/members/:discordUserId", async ({ params, cookieToken, set }) => {
        const resolved = await resolveManageablePermissionGroup(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }
        const result = await resolved.data.removeMember(params.discordUserId as string);
        if (!result.ok) { set.status = 400; return { error: result.error }; }
        return { ok: true };
    });
