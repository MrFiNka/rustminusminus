import { GatewayIntentBits } from "discord.js";
import mongoose from "mongoose";

import { DiscordBot } from "./classes/DiscordBot";
import { FmcListener } from "./classes/FmcListener";
import downloadItemList from "./downloadItemList";
import { WebServer } from "./classes/WebServer";
import websiteBuilding from "./websiteBuilding";
import "./modules/index"; // registers all modules into the registry
import { connectAll, disconnectAll } from "./rustplus/connections";
import { registry } from "./modules/ModuleRegistry";

await downloadItemList();
await mongoose.connect(Bun.env.MONGODB_URI);
await registry.primeGlobal();

await connectAll();

const client = new DiscordBot({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.init();
await FmcListener.ListenToAll();
await websiteBuilding();
const server = new WebServer().listen(Bun.env.PORT);

// Without this, SIGTERM (docker stop, a redeploy) killed the process with every Rust+ websocket and
// the Mongo pool still open, so the game server saw the connections time out rather than close.
let shuttingDown = false;
async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down ...`);
    try {
        await server.stop();
        disconnectAll();
        for (const listener of [...FmcListener.activeListeners.values()]) listener.stopListen();
        await client.destroy();
        await mongoose.disconnect();
    } catch (error) {
        console.error("Error during shutdown", error);
    }
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
