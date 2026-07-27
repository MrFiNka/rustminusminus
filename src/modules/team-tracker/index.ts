import type { TeamDiffEvent } from "rustminus";
import type { InGameCommand, RustModule } from "../types";
import { statusCommand } from "./status-command";
import { resolveModuleSettings } from "../moduleSettings";

/** Maps each diff event to the settings toggle that gates whether it's logged. `null` = always on. */
function settingKeyForChange(type: TeamDiffEvent["type"]): string | null {
    switch (type) {
        case "memberDied":
            return "notifyDeath";
        case "memberRespawned":
            return "notifyRespawn";
        case "memberJoined":
        case "memberLeft":
            return "notifyJoinLeave";
        case "memberWentOnline":
        case "memberWentOffline":
            return "notifyOnlineOffline";
        default:
            return null;
    }
}

function describeChange(change: TeamDiffEvent): string | null {
    switch (change.type) {
        case "leaderChanged":
            return `👑 Team leader changed`;
        case "memberJoined":
            return `➕ ${change.member.name} joined the team`;
        case "memberLeft":
            return `➖ ${change.member.name} left the team`;
        case "memberDied":
            return `💀 ${change.member.name} died`;
        case "memberRespawned":
            return `✨ ${change.member.name} respawned`;
        case "memberWentOnline":
            return `🟢 ${change.member.name} is now online`;
        case "memberWentOffline":
            return `🔴 ${change.member.name} went offline`;
        default:
            return null;
    }
}

function statusReplyCommand(name: string, filter: (m: { isOnline: boolean; isAlive: boolean }) => boolean): InGameCommand {
    return {
        name,
        match: (body, prefix) => body.trim().toLowerCase() === `${prefix}${name}`,
        async execute({ rustplus, reply }) {
            const info = await rustplus.getTeamInfo();
            const members = info.members.filter(filter);
            await reply(members.length ? members.map((m) => m.name).join(", ") : "none");
        },
    };
}

export const teamTracker: RustModule = {
    id: "team-tracker",
    name: "Team Tracker",
    description: "Log team member join/leave/online/offline/death/respawn events, and check status in-game.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [statusCommand],
    inGameCommands: [
        statusReplyCommand("online", (m) => m.isOnline && m.isAlive),
        statusReplyCommand("offline", (m) => !m.isOnline && m.isAlive),
        statusReplyCommand("dead", (m) => !m.isAlive),
    ],
    settingsSchema: [
        { key: "notifyDeath", label: "Log deaths", type: "boolean", default: true },
        { key: "notifyRespawn", label: "Log respawns", type: "boolean", default: true },
        { key: "notifyJoinLeave", label: "Log members joining/leaving", type: "boolean", default: true },
        { key: "notifyOnlineOffline", label: "Log members going online/offline", type: "boolean", default: true },
    ],
    async onTeamChanged({ team, changes }) {
        const channel = await team.getChannel("playerActivity");
        if (!channel) return;
        const settings = resolveModuleSettings(team, teamTracker);
        for (const change of changes) {
            const key = settingKeyForChange(change.type);
            if (key && settings[key] === false) continue;
            const line = describeChange(change);
            if (line) await channel.send(line);
        }
    },
};
