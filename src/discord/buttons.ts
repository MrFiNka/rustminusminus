import type { ButtonInteraction } from "discord.js";
import { TEAM_INVITE_PREFIX, handleInviteButton } from "./teamInvites";

/**
 * Routes one button interaction to its handler, mirroring how `dispatchChatInputCommand` resolves
 * slash commands by name.
 *
 * A customId is `<prefix>:<rest>`; only the prefix routes, and the handler owns the rest. Nothing
 * in a customId is trusted as authorization - Discord will happily deliver one that was copied or
 * pressed by the wrong person, so every handler re-validates against the database (see
 * handleInviteButton).
 *
 * Note for handlers: these can arrive from a DM, where `interaction.guildId` is null. Read ids off
 * your own persisted state, not off the interaction.
 */
const handlers: Record<string, (interaction: ButtonInteraction) => Promise<void>> = {
    [TEAM_INVITE_PREFIX]: handleInviteButton,
};

export async function dispatchButton(interaction: ButtonInteraction): Promise<void> {
    const prefix = interaction.customId.split(":")[0];
    const handler = prefix ? handlers[prefix] : undefined;
    // Unknown prefix: almost always a button from a build that no longer exists. Tell the user
    // rather than leaving Discord spinning until it times out.
    if (!handler) {
        await interaction.reply({ content: "This button is no longer supported.", flags: ["Ephemeral"] });
        return;
    }
    await handler(interaction);
}
