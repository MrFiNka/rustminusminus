import Elysia from "elysia";
import type { Types } from "mongoose";
import { PermissionGroupModel, createPermissionGroup } from "../../models/PermissionGroup";
import { GuildModel } from "../../models/Guild";
import { findGuildTeam } from "../../server/dataAccess/shared";
import { requireGuildAdmin } from "../../permissions/web";
import { PERMISSIONS } from "../../permissions/definitions";
import type { PermissionId } from "../../permissions/definitions";
import { getPermissionGroupsList } from "../../server/dataAccess/permissionGroups";
import { getPermissionGroupDetail, getPermissionDefinitions, getAssignableMembers } from "../../server/dataAccess/permissionGroupDetail";
import { sessionPlugin } from "./session";

export const permissionGroupsRoutes = new Elysia({ name: "permissionGroupsRoutes" })
    .use(sessionPlugin)
    .get("guilds/:guildId/permission-groups/definitions", async ({ params, cookieToken, set }) => {
        const result = await getPermissionDefinitions(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .get("guilds/:guildId/permission-groups", async ({ params, cookieToken, set }) => {
        const result = await getPermissionGroupsList(cookieToken as string | undefined, params.guildId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/permission-groups", async ({ params, body, cookieToken, set }) => {
        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const { name: rawName, teamId } = body as { name?: string; teamId?: string | null };
        const name = rawName?.trim();
        if (!name) { set.status = 400; return { error: "Group name is required" }; }
        // teamId (optional) scopes the group to one team; validate it belongs to this guild.
        let teamObjectId: Types.ObjectId | null = null;
        if (teamId) {
            const guild = await GuildModel.findOne({ guildId: params.guildId });
            const team = guild ? await findGuildTeam(guild, teamId) : null;
            if (!team) { set.status = 400; return { error: "That team isn't in this guild" }; }
            teamObjectId = team._id;
        }
        const existing = await PermissionGroupModel.findOne({ guildId: params.guildId, name, teamId: teamObjectId });
        if (existing) { set.status = 409; return { error: "A permission group with that name already exists in this scope" }; }
        const created = await createPermissionGroup(params.guildId as string, name, teamObjectId);
        if (!created) { set.status = 500; return { error: "Failed to create the permission group" }; }
        return { ok: true, id: created._id.toString() };
    })
    .get("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
        const result = await getPermissionGroupDetail(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .patch("guilds/:guildId/permission-groups/:groupId", async ({ params, body, cookieToken, set }) => {
        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
        const { name, permissions } = body as { name?: string; permissions?: PermissionId[] };
        if (name !== undefined) {
            const trimmed = name.trim();
            if (!trimmed) { set.status = 400; return { error: "Group name is required" }; }
            group.name = trimmed;
        }
        if (permissions !== undefined) {
            const validIds = new Set(PERMISSIONS.filter(p => p.status === "enforced").map(p => p.id));
            group.permissions = permissions.filter(p => validIds.has(p));
        }
        await group.save();
        return { ok: true };
    })
    .delete("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
        if (group) await group.deleteOne();
        return { ok: true };
    })
    .get("guilds/:guildId/permission-groups/:groupId/assignable-members", async ({ params, cookieToken, set }) => {
        const result = await getAssignableMembers(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return result.data;
    })
    .post("guilds/:guildId/permission-groups/:groupId/members", async ({ params, body, cookieToken, set }) => {
        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
        const { userId } = body as { userId: string };
        const result = await group.addMember(userId);
        if (!result.ok) { set.status = 400; return { error: result.error }; }
        return { ok: true };
    })
    .delete("guilds/:guildId/permission-groups/:groupId/members/:discordUserId", async ({ params, cookieToken, set }) => {
        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
            set.status = 401;
            return { error: "Not authorized" };
        }
        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
        const result = await group.removeMember(params.discordUserId as string);
        if (!result.ok) { set.status = 400; return { error: result.error }; }
        return { ok: true };
    });
