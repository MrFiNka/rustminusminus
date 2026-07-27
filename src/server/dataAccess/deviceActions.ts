import type { PermissionId } from "../../permissions/definitions";
import type { PairedItemKind } from "../../rustplus/pairedItems";
import { setPairedItemName, removePairedItem } from "../../rustplus/pairedItems";
import { invalidateServerSnapshot, renameLiveEntity, removeLiveEntity } from "../../rustplus/serverSnapshot";
import { removeTrackedEmbed } from "../../discord/trackedEmbed";
import { fail, ok, requireTeamModuleAccess } from "./shared";

const MODULE_AND_PERMISSION_BY_KIND: Record<PairedItemKind, { moduleId: string; permission: PermissionId }> = {
    smartSwitch: { moduleId: "smart-switches", permission: "switches.toggle" },
    smartAlarm: { moduleId: "smart-alarms", permission: "alarms.manage" },
    storageMonitor: { moduleId: "storage-monitors", permission: "storagemonitors.manage" },
};

/** The `team.discord` channel each entity kind's live status message lives in. */
const CHANNEL_KEY_BY_KIND: Record<PairedItemKind, "switches" | "alarms" | "storageMonitors"> = {
    smartSwitch: "switches",
    smartAlarm: "alarms",
    storageMonitor: "storageMonitors",
};

export async function renameDevice(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
    kind: PairedItemKind,
    entityId: string,
    name: string,
) {
    const { moduleId, permission } = MODULE_AND_PERMISSION_BY_KIND[kind];
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, moduleId, permission);
    if (!auth.ok) return auth;

    const renamed = await setPairedItemName(auth.data.team, serverId, kind, entityId, name);
    if (!renamed) return fail(404, "Device not found");
    invalidateServerSnapshot(auth.data.team._id, serverId);
    renameLiveEntity(auth.data.team._id, kind, entityId, name);
    return ok(null);
}

export async function removeDevice(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
    kind: PairedItemKind,
    entityId: string,
) {
    const { moduleId, permission } = MODULE_AND_PERMISSION_BY_KIND[kind];
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, moduleId, permission);
    if (!auth.ok) return auth;

    const removed = await removePairedItem(auth.data.team, serverId, kind, entityId);
    if (!removed) return fail(404, "Device not found");

    const channelKey = CHANNEL_KEY_BY_KIND[kind];
    const channel = await auth.data.team.getChannel(channelKey);
    await removeTrackedEmbed({
        channel,
        messages: auth.data.team.discord[channelKey].messages,
        key: entityId,
        persist: () => auth.data.team.save(),
    });

    invalidateServerSnapshot(auth.data.team._id, serverId);
    removeLiveEntity(auth.data.team._id, kind, entityId);
    return ok(null);
}
