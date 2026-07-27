import type { EmbedBuilder, TextBasedChannel } from "discord.js";
import type { TrackedMessage } from "../models/Team";

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
        } catch {
            // message was deleted or otherwise unreachable - fall through and repost it below
        }
    }

    const sent = await channel.send({ embeds: [embed] });
    const remaining = messages.filter(m => m.key !== key);
    remaining.push({ id: sent.id, key });
    messages.length = 0;
    messages.push(...remaining);
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

    const remaining = messages.filter(m => m.key !== key);
    messages.length = 0;
    messages.push(...remaining);
    await persist();
}
