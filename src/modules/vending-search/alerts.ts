import { EmbedBuilder } from "discord.js";
import type { GuildClass } from "../../models/Guild";
import type { TeamClass } from "../../models/Team";
import { VendingWatchModel, type VendingWatchClass } from "../../models/VendingWatch";
import { formatOrder } from "./format";
import { criteriaOf, evaluateWatch } from "./watches";
import type { MarketSnapshot, VendingOrder } from "./types";

/** Alert lines per embed. A watch on something common (e.g. "wood") can match dozens of shops at
 *  once; Discord embeds have hard limits, and a wall of listings is unreadable anyway. */
const MAX_ALERT_LINES = 10;

function describeWatch(watch: VendingWatchClass): string {
    const parts = [`"${watch.query}"`];
    if (watch.side === "buy") parts.push("(shops paying in it)");
    if (watch.maxPrice !== null) parts.push(`under ${watch.maxPrice}/ea`);
    return parts.join(" ");
}

/** Resolves the channel a watch posts to: its own if set, else the team's events channel, creating
 *  that channel if the team hasn't got one yet - the same resolution `map-events` uses. */
async function resolveChannel(guild: GuildClass, team: TeamClass, watch: VendingWatchClass) {
    let channelId = watch.channelId ?? team.discord.events?.id;
    if (!channelId) channelId = (await guild.ensureEventsChannel(team)) ?? undefined;
    if (!channelId) return null;
    const channel = guild.getDiscordGuild()?.channels.cache.get(channelId);
    return channel?.isSendable() ? channel : null;
}

function buildEmbed(watch: VendingWatchClass, triggered: VendingOrder[]): EmbedBuilder {
    const shown = triggered.slice(0, MAX_ALERT_LINES);
    const overflow = triggered.length - shown.length;
    return new EmbedBuilder()
        .setTitle("🛒 Market watch")
        .setDescription([
            `Matches for ${describeWatch(watch)}:`,
            ...shown.map(order => `• ${formatOrder(order)}`),
            overflow > 0 ? `…and ${overflow} more` : "",
        ].filter(Boolean).join("\n"))
        .setColor(0x22c55e)
        .setTimestamp();
}

/**
 * Evaluates every enabled watch for this team+server against one market snapshot and posts alerts.
 *
 * One snapshot serves all of a team's watches - the Rust+ read happens once per tick regardless of
 * how many watches exist, which is what keeps the max-watches setting a UI nicety rather than a call
 * budget concern.
 *
 * The fingerprint baseline is persisted *whether or not anything fired*, and before the send is
 * awaited: a Discord outage should cost one alert, not turn the next tick into a replay of every
 * currently-matching listing.
 */
export async function runWatches(
    guild: GuildClass,
    team: TeamClass,
    serverId: string,
    snapshot: MarketSnapshot,
    pingEveryone: boolean,
): Promise<void> {
    const watches = await VendingWatchModel.find({ teamId: team._id, serverId, enabled: true });
    if (watches.length === 0) return;

    for (const watch of watches) {
        const { triggered, fingerprints } = evaluateWatch(snapshot, criteriaOf(watch), watch.lastSeenFingerprints);

        watch.lastSeenFingerprints = fingerprints;
        if (triggered.length > 0) watch.lastAlertedAt = new Date();
        await watch.save();

        if (triggered.length === 0) continue;

        const channel = await resolveChannel(guild, team, watch);
        if (!channel) continue;
        const embed = buildEmbed(watch, triggered);
        try {
            await channel.send(pingEveryone
                ? { content: "@everyone", embeds: [embed], allowedMentions: { parse: ["everyone"] } }
                : { embeds: [embed] });
        } catch (error) {
            // Baseline is already persisted, so a failed send just loses this one alert rather than
            // queueing the whole matching set to fire again next tick.
            console.error("vending-search: failed to send watch alert", error);
        }
    }
}
