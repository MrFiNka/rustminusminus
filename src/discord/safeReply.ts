import {
    DiscordAPIError,
    RESTJSONErrorCodes,
    type ChatInputCommandInteraction,
    type InteractionEditReplyOptions,
} from "discord.js";

/** The interaction's response can no longer be reached: its message, channel, or the interaction
 *  token itself is gone. Nothing to report to and nothing to retry. */
function isUnreachable(err: unknown): boolean {
    return err instanceof DiscordAPIError && (
        err.code === RESTJSONErrorCodes.UnknownMessage
        || err.code === RESTJSONErrorCodes.UnknownChannel
        || err.code === RESTJSONErrorCodes.UnknownInteraction
        || err.code === RESTJSONErrorCodes.InvalidWebhookToken
    );
}

/**
 * `interaction.editReply` that tolerates the reply having been destroyed underneath it.
 *
 * `/team reset` and `/team delete` delete every channel in the team's category — and if the command
 * was invoked from one of those channels (the common case), that includes the channel holding this
 * interaction's own deferred response. Editing it then fails with 10008 Unknown Message, which used
 * to escape as an unhandled rejection. The work already succeeded at that point, so the only correct
 * thing to do is drop the confirmation.
 *
 * Returns true if the user actually saw the reply.
 */
export async function safeEditReply(
    interaction: ChatInputCommandInteraction,
    options: string | InteractionEditReplyOptions,
): Promise<boolean> {
    try {
        await interaction.editReply(options);
        return true;
    } catch (err) {
        if (isUnreachable(err)) return false;
        throw err;
    }
}
