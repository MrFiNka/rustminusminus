import { EmbedBuilder } from "discord.js";
import type { RustModule } from "../types";
import { raidAlertCommand } from "./raidalert-command";
import { resolveModuleSettings } from "../moduleSettings";
import { toGridReference } from "../../rustplus/gridReference";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export const raidAlerts: RustModule = {
    id: "raid-alerts",
    name: "Raid Alerts",
    description: "Ping the team when an explosion is detected near an online member.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [raidAlertCommand],
    settingsSchema: [
        { key: "radiusMeters", label: "Alert radius (meters)", type: "number", default: 100, min: 1 },
        { key: "pingEveryone", label: "Ping @everyone on a detected raid", type: "boolean", default: true },
    ],
    async onMapEvent({ rustplus, team, guild, event }) {
        if (event.type !== "explosionSpawned") return;

        const settings = resolveModuleSettings(team, raidAlerts);
        const radius = typeof settings.radiusMeters === "number" && settings.radiusMeters > 0 ? settings.radiusMeters : 100;
        const info = await rustplus.getTeamInfo();
        const nearby = info.members.filter((m) => m.isOnline && m.isAlive && distance(m, event.marker) <= radius);
        if (nearby.length === 0) return;

        let channelId = team.discord.events?.id;
        if (!channelId) channelId = (await guild.ensureEventsChannel(team)) ?? undefined;
        if (!channelId) return;
        const channel = guild.getDiscordGuild()?.channels.cache.get(channelId);
        if (!channel?.isSendable()) return;

        const serverInfo = await rustplus.getInfo();
        const grid = toGridReference(event.marker.x, event.marker.y, serverInfo.mapSize);
        const embed = new EmbedBuilder()
            .setTitle("🚨 Possible raid detected")
            .setDescription(`Explosion near ${nearby.map((m) => m.name).join(", ")} at grid ${grid}`)
            .setColor(0xed4245)
            .setTimestamp();
        const pingEveryone = settings.pingEveryone !== false;
        await channel.send(pingEveryone
            ? { content: "@everyone", embeds: [embed], allowedMentions: { parse: ["everyone"] } }
            : { embeds: [embed] });
    },
};
