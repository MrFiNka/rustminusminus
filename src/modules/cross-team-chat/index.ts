import { ChatLinkModel } from "../../models/ChatLink";
import { TeamModel } from "../../models/Team";
import { getActiveRustplus } from "../../rustplus/connections";
import type { RustModule } from "../types";
import { registry } from "../ModuleRegistry";
import { chatLinkCommand } from "./chatlink-command";

/** Marks a relayed message so it never gets picked up and re-relayed by another linked team. */
const RELAY_PREFIX = "[relay] ";

export const crossTeamChat: RustModule = {
    id: "cross-team-chat",
    name: "Cross-Team Chat",
    description: "Relay team chat between linked teams.",
    scope: "guild",
    defaultEnabled: false,
    discordCommands: [chatLinkCommand],
    async onTeamMessage({ rustplus, team, message }) {
        if (message.steamId === rustplus.playerId) return; // guard 1: our own relayed echo
        if (message.message.startsWith(RELAY_PREFIX)) return; // guard 2: don't re-relay a relay

        const link = await ChatLinkModel.findOne({ teamIds: team._id });
        if (!link) return;

        for (const otherId of link.teamIds.filter((id) => !id.equals(team._id))) {
            const other = await TeamModel.findById(otherId);
            if (!other || !registry.isEnabledForTeam("cross-team-chat", other)) continue;
            const conn = getActiveRustplus(otherId);
            if (!conn?.isConnected()) continue;
            await conn.sendTeamMessage(`${RELAY_PREFIX}[${team.name}] ${message.name}: ${message.message}`);
        }
    },
};
