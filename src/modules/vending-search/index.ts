import type { InGameCommand, RustModule } from "../types";
import { marketCommand } from "./market-command";
import { searchVendingMachines } from "./search";
import { escapeRegExp } from "../../utils";

const marketChatCommand: InGameCommand = {
    name: "market-search",
    match: (body, prefix) => new RegExp(`^${escapeRegExp(prefix)}market\\s+.+`, "i").test(body.trim()),
    async execute({ rustplus, message, prefix, reply }) {
        const query = message.message.trim().slice(`${prefix}market`.length).trim();
        if (!query) return await reply(`Usage: ${prefix}market <item>`);
        const results = await searchVendingMachines(rustplus, query);
        await reply(results.length ? results.slice(0, 5).join(" | ") : `No vending machines selling "${query}"`);
    },
};

export const vendingSearch: RustModule = {
    id: "vending-search",
    name: "Vending Search",
    description: "Search paired server vending machines for an item, in Discord or in-game.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [marketCommand],
    inGameCommands: [marketChatCommand],
};
