import type { TeamClass } from "../models/Team";
import { invalidateTeam } from "./connections";

export type PairedItemKind = "smartSwitch" | "smartAlarm" | "storageMonitor";

const KIND_LABELS: Record<PairedItemKind, string> = {
    smartSwitch: "Switch",
    smartAlarm: "Alarm",
    storageMonitor: "Storage Monitor",
};

/** Falls back to "{kind} {id}" for devices that haven't been given a custom name yet. */
export function displayName(item: { id: string; name?: string }, kind: PairedItemKind): string {
    return item.name ?? `${KIND_LABELS[kind]} ${item.id}`;
}

type TeamServer = TeamClass["servers"][number];

/** Resolves a paired device by its raw Rust+ entity id or by its case-insensitive custom name. */
export function findPairedItem(server: TeamServer, kind: PairedItemKind, idOrName: string) {
    const items = server.pairedItems[kind];
    return items.find(i => i.id === idOrName) ?? items.find(i => i.name?.toLowerCase() === idOrName.toLowerCase());
}

export async function setPairedItemName(team: TeamClass, serverId: string, kind: PairedItemKind, id: string, name: string): Promise<boolean> {
    const server = team.servers.find(s => s.serverId === serverId);
    const item = server?.pairedItems[kind].find(i => i.id === id);
    if (!item) return false;
    item.name = name;
    await team.save();
    invalidateTeam(team._id);
    return true;
}

/** Unpairs a device from a team's server (e.g. one that's been destroyed in-game). Returns false
 *  if the server or device isn't found. */
export async function removePairedItem(team: TeamClass, serverId: string, kind: PairedItemKind, id: string): Promise<boolean> {
    const server = team.servers.find(s => s.serverId === serverId);
    if (!server) return false;
    const items = server.pairedItems[kind];
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return false;
    items.splice(index, 1);
    await team.save();
    invalidateTeam(team._id);
    return true;
}
