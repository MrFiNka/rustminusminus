import { DiscordAPIError, RESTJSONErrorCodes, type EmbedBuilder, type TextBasedChannel } from "discord.js";
import type { TrackedMessage } from "../models/Team";

/** Editing failed because the message (or its channel) is gone for good - reposting is the only
 *  way to recover. Anything else (rate limit, missing perms, network) is transient or a config
 *  problem: reposting there would just add a duplicate alongside a message that still exists. */
function isGone(err: unknown): boolean {
    return err instanceof DiscordAPIError
        && (err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownChannel);
}

/**
 * Replaces the tracked id for `key` in place.
 *
 * Uses splice/push rather than rebuilding the array (`messages.length = 0; messages.push(...)`),
 * which is what this did before: Mongoose diffs that pattern as a bare `$push` of the new entry and
 * never emits the removal, so the stale `{id,key}` survived in the database. The next event then
 * found the *old* id first, failed to edit the deleted message, posted a new one, and pushed again -
 * re-posting an embed on every single update instead of editing one in place, forever.
 */
function setTrackedId(messages: TrackedMessage[], key: string, id: string): void {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.key === key) messages.splice(i, 1);
    }
    messages.push({ id, key });
}

/**
 * Keeps one live-updating embed per `key` in `channel`: edits the previously-sent message for
 * that key if it still exists, otherwise sends a new one and swaps the tracked id. `messages` is
 * the mongoose subdocument array to read/mutate in place (e.g. `team.discord.switches.messages`);
 * `persist` is called after mutating it (typically `() => team.save()`).
 */
export async function upsertTrackedEmbed(options: {
    channel: TextBasedChannel;
    messages: TrackedMessage[];
    key: string;
    embed: EmbedBuilder;
    persist: () => Promise<unknown>;
}): Promise<void> {
    const { channel, messages, key, embed, persist } = options;
    if (!channel.isSendable()) return;

    const existing = messages.find(m => m.key === key);
    if (existing) {
        try {
            await channel.messages.edit(existing.id, { embeds: [embed] });
            return;
        } catch (err) {
            // Only a genuinely-gone message justifies reposting (e.g. after /team reset recreated
            // the channel). Bailing on anything else keeps a transient failure from posting a
            // duplicate next to the message it failed to edit.
            if (!isGone(err)) {
                console.error(`Failed to edit tracked embed "${key}":`, err);
                return;
            }
        }
    }

    const sent = await channel.send({ embeds: [embed] });
    setTrackedId(messages, key, sent.id);
    await persist();
}

/**
 * Deletes the tracked message for `key` (the counterpart to {@link upsertTrackedEmbed}): removes
 * the Discord message if it's still reachable, then drops its `{id,key}` entry from `messages` and
 * persists. The DB entry is dropped even when `channel` is null/unreachable so no orphan is left.
 */
export async function removeTrackedEmbed(options: {
    channel: TextBasedChannel | null;
    messages: TrackedMessage[];
    key: string;
    persist: () => Promise<unknown>;
}): Promise<void> {
    const { channel, messages, key, persist } = options;
    const existing = messages.find(m => m.key === key);
    if (!existing) return;

    if (channel?.isSendable()) {
        try {
            await channel.messages.delete(existing.id);
        } catch {
            // message was already deleted or otherwise unreachable - still drop the DB entry below
        }
    }

    // splice, not a rebuild - see setTrackedId for why the previous pattern didn't persist.
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.key === key) messages.splice(i, 1);
    }
    await persist();
}
