import type { RustModule } from "../types";
import { UserModel } from "../../models/User";
import { consumeRelayedEcho } from "../../rustplus/connections";

export const chatRelay: RustModule = {
    id: "chat-relay",
    name: "Chat Relay",
    description: "Bridge in-game team chat and the team's Discord channel in both directions.",
    scope: "team",
    defaultEnabled: false,
    async onTeamMessage({ team, guild, message }) {
        // Suppress only the messages we ourselves relayed from Discord (tracked precisely by the echo
        // cache), so they aren't double-posted. Everything else in team chat - in-game players, the
        // active account's own chat, web-originated sends - is genuine content that belongs in Discord.
        if (consumeRelayedEcho(team._id, message.steamId, message.message)) return;
        const channel = await team.getChannel("teamChat");
        if (!channel?.isSendable()) return;

        // Attribute to the sender's linked Discord identity when we can resolve it, falling back to
        // their in-game name otherwise.
        let display = message.name;
        const linked = await UserModel.findOne({ "credentials.steam_id": message.steamId });
        if (linked && team.users.some(id => id.equals(linked._id))) {
            const member = await guild.getDiscordGuild()?.members.fetch(linked.userId).catch(() => null);
            if (member) display = `${member.displayName} (${message.name})`;
        }
        await channel.send(`**${display}**: ${message.message}`);
    },
};
