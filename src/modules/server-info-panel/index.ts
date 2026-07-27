import { EmbedBuilder } from "discord.js";
import type { InGameCommand, RustModule } from "../types";
import { upsertTrackedEmbed } from "../../discord/trackedEmbed";

function formatClock(time: number): string {
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isDaytime(time: number, sunrise: number, sunset: number): boolean {
    return time >= sunrise && time < sunset;
}

const popCommand: InGameCommand = {
    name: "server-pop",
    match: (body, prefix) => body.trim().toLowerCase() === `${prefix}pop`,
    async execute({ rustplus, reply }) {
        const info = await rustplus.getInfo();
        await reply(`${info.players}/${info.maxPlayers} players${info.queuedPlayers ? ` (${info.queuedPlayers} queued)` : ""}`);
    },
};

const timeCommand: InGameCommand = {
    name: "server-time",
    match: (body, prefix) => body.trim().toLowerCase() === `${prefix}time`,
    async execute({ rustplus, reply }) {
        const time = await rustplus.getTime();
        const status = isDaytime(time.time, time.sunrise, time.sunset) ? "day" : "night";
        await reply(`${formatClock(time.time)} (${status}) — sunrise ${formatClock(time.sunrise)}, sunset ${formatClock(time.sunset)}`);
    },
};

const wipeCommand: InGameCommand = {
    name: "server-wipe",
    match: (body, prefix) => body.trim().toLowerCase() === `${prefix}wipe`,
    async execute({ rustplus, reply }) {
        const info = await rustplus.getInfo();
        await reply(`Last wipe: ${new Date(info.wipeTime * 1000).toUTCString()}`);
    },
};

export const serverInfoPanel: RustModule = {
    id: "server-info-panel",
    name: "Server Info Panel",
    description: "Live population/time/wipe panel in the information channel, plus !pop/!time/!wipe in-game.",
    scope: "team",
    defaultEnabled: false,
    inGameCommands: [popCommand, timeCommand, wipeCommand],
    async onTick({ rustplus, team }) {
        const channel = await team.getChannel("information");
        if (!channel) return;

        const [info, time] = await Promise.all([rustplus.getInfo(), rustplus.getTime()]);
        const status = isDaytime(time.time, time.sunrise, time.sunset) ? "☀️ Day" : "🌙 Night";
        const embed = new EmbedBuilder()
            .setTitle(info.name)
            .addFields(
                { name: "Players", value: `${info.players}/${info.maxPlayers}${info.queuedPlayers ? ` (${info.queuedPlayers} queued)` : ""}`, inline: true },
                { name: "Time", value: `${formatClock(time.time)} — ${status}`, inline: true },
                { name: "Last wipe", value: new Date(info.wipeTime * 1000).toUTCString(), inline: true },
            )
            .setTimestamp();

        await upsertTrackedEmbed({
            channel,
            messages: team.discord.information.messages,
            key: "server-info-panel",
            embed,
            persist: () => team.save(),
        });
    },
};
