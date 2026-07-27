import { EmbedBuilder } from "discord.js";
import { AppMarkerType } from "rustminus";
import type { InGameCommand, RustModule } from "../types";
import type { MapMarkerEventType } from "../../rustplus/mapMarkerDiff";
import { eventsCommand } from "./events-command";
import { toGridReference } from "../../rustplus/gridReference";
import { EVENT_LABELS_BY_MARKER_TYPE } from "../../rustplus/markerLabels";
import { resolveModuleSettings } from "../moduleSettings";

/** Maps each map event to the settings toggle gating its alert. `null` = always alert (e.g. explosions). */
function settingKeyForEvent(type: MapMarkerEventType): string | null {
    switch (type) {
        case "cargoShipSpawned":
        case "cargoShipDespawned":
            return "notifyCargo";
        case "patrolHelicopterSpawned":
        case "patrolHelicopterDespawned":
            return "notifyHeli";
        case "ch47Spawned":
        case "ch47Despawned":
            return "notifyChinook";
        case "crateSpawned":
        case "crateDespawned":
            return "notifyCrate";
        default:
            return null;
    }
}

const EVENT_DESCRIPTIONS: Record<MapMarkerEventType, { title: string; color: number }> = {
    cargoShipSpawned: { title: "🚢 Cargo Ship has spawned", color: 0x3498db },
    cargoShipDespawned: { title: "🚢 Cargo Ship has left", color: 0x99aab5 },
    patrolHelicopterSpawned: { title: "🚁 Patrol Helicopter inbound", color: 0xe67e22 },
    patrolHelicopterDespawned: { title: "🚁 Patrol Helicopter has despawned", color: 0x99aab5 },
    ch47Spawned: { title: "🛩️ Chinook spotted", color: 0xe67e22 },
    ch47Despawned: { title: "🛩️ Chinook has left", color: 0x99aab5 },
    crateSpawned: { title: "📦 Locked Crate spawned", color: 0xf1c40f },
    crateDespawned: { title: "📦 Locked Crate is gone", color: 0x99aab5 },
    explosionSpawned: { title: "💥 Explosion detected", color: 0xed4245 },
};

function locateCommand(triggerWord: string, markerType: AppMarkerType): InGameCommand {
    return {
        name: `map-events-${triggerWord}`,
        match: (body, prefix) => body.trim().toLowerCase() === `${prefix}${triggerWord}`,
        async execute({ rustplus, reply }) {
            const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
            const active = markers.filter((m) => m.type === markerType);
            if (active.length === 0) return await reply("Not currently active");
            await reply(active.map((m) => toGridReference(m.x, m.y, info.mapSize)).join(", "));
        },
    };
}

const listCommand: InGameCommand = {
    name: "map-events-list",
    match: (body, prefix) => body.trim().toLowerCase() === `${prefix}events`,
    async execute({ rustplus, reply }) {
        const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
        const active = markers.filter((m) => m.type in EVENT_LABELS_BY_MARKER_TYPE);
        if (active.length === 0) return await reply("No active map events");
        await reply(active.map((m) => `${EVENT_LABELS_BY_MARKER_TYPE[m.type]} @ ${toGridReference(m.x, m.y, info.mapSize)}`).join(", "));
    },
};

export const mapEvents: RustModule = {
    id: "map-events",
    name: "Map Events",
    description: "Alert on cargo ship/patrol heli/chinook/crate/explosion spawns, with grid location.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [eventsCommand],
    inGameCommands: [
        locateCommand("cargo", AppMarkerType.CargoShip),
        locateCommand("heli", AppMarkerType.PatrolHelicopter),
        locateCommand("chinook", AppMarkerType.CH47),
        locateCommand("crate", AppMarkerType.Crate),
        listCommand,
    ],
    settingsSchema: [
        { key: "notifyCargo", label: "Alert on Cargo Ship", type: "boolean", default: true },
        { key: "notifyHeli", label: "Alert on Patrol Helicopter", type: "boolean", default: true },
        { key: "notifyChinook", label: "Alert on Chinook (CH47)", type: "boolean", default: true },
        { key: "notifyCrate", label: "Alert on Locked Crate", type: "boolean", default: true },
        { key: "pingEveryone", label: "Ping @everyone on alerts", type: "boolean", default: true },
    ],
    async onMapEvent({ rustplus, team, guild, event }) {
        const settings = resolveModuleSettings(team, mapEvents);
        const key = settingKeyForEvent(event.type);
        if (key && settings[key] === false) return;

        let channelId = team.discord.events?.id;
        if (!channelId) channelId = (await guild.ensureEventsChannel(team)) ?? undefined;
        if (!channelId) return;
        const channel = guild.getDiscordGuild()?.channels.cache.get(channelId);
        if (!channel?.isSendable()) return;

        const info = await rustplus.getInfo();
        const grid = toGridReference(event.marker.x, event.marker.y, info.mapSize);
        const { title, color } = EVENT_DESCRIPTIONS[event.type];
        const embed = new EmbedBuilder().setTitle(title).setDescription(`Grid: ${grid}`).setColor(color).setTimestamp();
        const pingEveryone = settings.pingEveryone !== false;
        await channel.send(pingEveryone
            ? { content: "@everyone", embeds: [embed], allowedMentions: { parse: ["everyone"] } }
            : { embeds: [embed] });
    },
};
