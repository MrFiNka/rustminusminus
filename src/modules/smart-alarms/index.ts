import { EmbedBuilder } from "discord.js";
import type { InGameCommand, RustModule } from "../types";
import { alarmCommand } from "./alarm-command";
import { displayName } from "../../rustplus/pairedItems";
import { upsertTrackedEmbed } from "../../discord/trackedEmbed";
import { getModuleSetting } from "../moduleSettings";

const listCommand: InGameCommand = {
    name: "alarm-list",
    match: (body, prefix) => body.trim().toLowerCase() === `${prefix}alarms`,
    async execute({ team, reply }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const alarms = server?.pairedItems.smartAlarm ?? [];
        await reply(alarms.length ? alarms.map((a) => displayName(a, "smartAlarm")).join(", ") : "No paired alarms");
    },
};

export const smartAlarms: RustModule = {
    id: "smart-alarms",
    name: "Smart Alarms",
    description: "Rename/list paired smart alarms and post an alert whenever one triggers.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [alarmCommand],
    inGameCommands: [listCommand],
    settingsSchema: [
        {
            key: "pingEveryone",
            label: "Ping @everyone when an alarm triggers",
            type: "boolean",
            default: false,
        },
    ],
    async onEntityChanged({ team, entityId, payload }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const item = server?.pairedItems.smartAlarm.find((a) => a.id === String(entityId));
        if (!item) return;

        const channel = await team.getChannel("alarms");
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setTitle(displayName(item, "smartAlarm"))
            .setDescription(payload.value ? "🚨 Triggered!" : "🔕 Armed")
            .setColor(payload.value ? 0xed4245 : 0x57f287)
            .setTimestamp();
        await upsertTrackedEmbed({
            channel,
            messages: team.discord.alarms.messages,
            key: item.id,
            embed,
            persist: () => team.save(),
        });

        // On a trigger (not on re-arming), optionally post a separate @everyone ping alongside the
        // in-place status embed above.
        if (payload.value && getModuleSetting<boolean>(team, smartAlarms, "pingEveryone") && channel.isSendable()) {
            await channel.send({
                content: `@everyone 🚨 ${displayName(item, "smartAlarm")} triggered!`,
                allowedMentions: { parse: ["everyone"] },
            });
        }
    },
};
