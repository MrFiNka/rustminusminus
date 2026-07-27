import type { InGameCommand, RustModule } from "../types";
import { marketCommand } from "./market-command";
import { listVendingMachines, searchInStock } from "./search";
import { formatOrder } from "./format";
import { runWatches } from "./alerts";
import { resolveModuleSettings } from "../moduleSettings";
import { escapeRegExp } from "../../utils";

const marketChatCommand: InGameCommand = {
    name: "market-search",
    match: (body, prefix) => new RegExp(`^${escapeRegExp(prefix)}market\\s+.+`, "i").test(body.trim()),
    async execute({ rustplus, message, prefix, reply }) {
        const query = message.message.trim().slice(`${prefix}market`.length).trim();
        if (!query) return await reply(`Usage: ${prefix}market <item>`);
        const results = await searchInStock(rustplus, query);
        await reply(results.length
            ? results.slice(0, 5).map(formatOrder).join(" | ")
            : `No vending machines selling "${query}"`);
    },
};

/**
 * Ticks since each connection's last watch evaluation.
 *
 * `onTick` fires on the dispatcher's fixed 30s interval and a module can't set its own, so the poll
 * interval is expressed as "every N ticks" and counted here. Keyed by team so two teams on different
 * intervals don't interfere, and entries are only created for teams that actually have the module on.
 *
 * Not cleaned up on disable: `ModuleRegistry.setEnabled` passes no `teamId` to onEnable/onDisable for
 * a team-scoped toggle, so a cleanup hook there would silently never run. One integer per team that
 * has ever had the module enabled is a bounded, harmless residue - and a stale count costs at most
 * one extra interval on re-enable.
 */
const ticksSinceRun = new Map<string, number>();

export const vendingSearch: RustModule = {
    id: "vending-search",
    name: "Vending Search",
    description: "Search paired server vending machines for an item, in Discord, in-game or on the map.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [marketCommand],
    inGameCommands: [marketChatCommand],
    settingsSchema: [
        {
            key: "watchPollTicks",
            label: "Check watches every N ticks",
            type: "number",
            default: 2,
            min: 1,
            max: 60,
            description: "One tick is 30 seconds. Vending machines change slowly, so 2 (a minute) is plenty.",
        },
        {
            key: "maxWatchesPerTeam",
            label: "Maximum watches per team",
            type: "number",
            default: 20,
            min: 1,
            max: 100,
        },
        {
            key: "pingEveryone",
            label: "Ping @everyone on a watch alert",
            type: "boolean",
            default: false,
            description: "Off by default — a price alert is rarely worth waking the whole server.",
        },
    ],
    async onTick({ rustplus, team, guild }) {
        const settings = resolveModuleSettings(team, vendingSearch);
        const every = typeof settings.watchPollTicks === "number" && settings.watchPollTicks >= 1
            ? Math.floor(settings.watchPollTicks)
            : 2;

        const key = team._id.toString();
        const elapsed = (ticksSinceRun.get(key) ?? every) + 1;
        if (elapsed < every) {
            ticksSinceRun.set(key, elapsed);
            return;
        }
        ticksSinceRun.set(key, 0);

        const serverId = team.activeServerId;
        if (!serverId) return;
        // One market read serves every watch this team has.
        const snapshot = await listVendingMachines(rustplus);
        await runWatches(guild, team, serverId, snapshot, settings.pingEveryone === true);
    },
};
