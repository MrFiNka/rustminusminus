import { isValidObjectId } from "mongoose";
import { VendingWatchModel, type VendingWatchClass } from "../../models/VendingWatch";
import { getModuleSettingById } from "../../modules/moduleSettings";
import { getSessionDiscordId } from "../../permissions/web";
import { fail, ok, requireTeamModuleAccess, requireTeamModuleEnabled } from "./shared";

const MAX_QUERY_LENGTH = 100;
const SIDES = ["sell", "buy", "both"] as const;
type Side = (typeof SIDES)[number];

/** Wire shape - deliberately omits `lastSeenFingerprints`, which is internal bookkeeping that would
 *  be a few KB of noise on every list response. */
function shape(watch: VendingWatchClass) {
    return {
        id: watch._id.toString(),
        serverId: watch.serverId,
        query: watch.query,
        side: watch.side,
        maxPrice: watch.maxPrice,
        currencyId: watch.currencyId,
        channelId: watch.channelId,
        createdBy: watch.createdBy,
        enabled: watch.enabled,
        lastAlertedAt: watch.lastAlertedAt ? watch.lastAlertedAt.toISOString() : null,
    };
}

/** Listing is a read, so it takes the same open-to-team-members gate the market browser does. */
export async function listVendingWatches(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
) {
    const auth = await requireTeamModuleEnabled(cookieToken, guildId, teamId, "vending-search");
    if (!auth.ok) return auth;
    const watches = await VendingWatchModel.find({ teamId: auth.data.team._id, serverId }).sort({ createdAt: 1 });
    return ok({ watches: watches.map(shape) });
}

export interface WatchInput {
    query?: string;
    side?: string;
    maxPrice?: number | null;
    currencyId?: number | null;
    channelId?: string | null;
}

export async function createVendingWatch(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
    input: WatchInput,
) {
    // Creating a watch makes the bot post to Discord on a schedule, so unlike browsing it needs a
    // permission of its own - the same read/manage split every other module uses.
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, "vending-search", "vending.watch");
    if (!auth.ok) return auth;
    const { team } = auth.data;

    const query = input.query?.trim();
    if (!query) return fail(400, "A search query is required");
    if (query.length > MAX_QUERY_LENGTH) return fail(400, `The query must be at most ${MAX_QUERY_LENGTH} characters`);
    if (!team.servers.some(s => s.serverId === serverId)) return fail(404, "This team hasn't paired with that server");

    const side = (input.side ?? "sell") as Side;
    if (!SIDES.includes(side)) return fail(400, "Invalid trade side");

    if (input.maxPrice !== undefined && input.maxPrice !== null) {
        if (!Number.isFinite(input.maxPrice) || input.maxPrice <= 0) return fail(400, "Max price must be a positive number");
    }

    const max = getModuleSettingById<number>(team, "vending-search", "maxWatchesPerTeam") ?? 20;
    const existing = await VendingWatchModel.countDocuments({ teamId: team._id });
    if (existing >= max) return fail(400, `This team already has the maximum of ${max} watches`);

    const createdBy = await getSessionDiscordId(cookieToken);
    if (!createdBy) return fail(401, "Not authorized");

    const watch = await VendingWatchModel.create({
        teamId: team._id,
        serverId,
        query,
        side,
        maxPrice: input.maxPrice ?? null,
        currencyId: input.currencyId ?? null,
        channelId: input.channelId ?? null,
        createdBy,
        enabled: true,
        // Deliberately empty: the first evaluation should alert on whatever already matches, since
        // the watch was created to find out.
        lastSeenFingerprints: [],
    });
    return ok({ watch: shape(watch) });
}

async function resolveOwnWatch(teamId: unknown, watchId: string) {
    if (!isValidObjectId(watchId)) return null;
    // Scoped to the team so a watch id from another team can't be touched.
    return VendingWatchModel.findOne({ _id: watchId, teamId });
}

export async function setVendingWatchEnabled(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    watchId: string,
    enabled: boolean,
) {
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, "vending-search", "vending.watch");
    if (!auth.ok) return auth;
    const watch = await resolveOwnWatch(auth.data.team._id, watchId);
    if (!watch) return fail(404, "Watch not found");
    watch.enabled = enabled;
    // Re-enabling starts from a clean baseline, so it reports what's available now rather than
    // staying silent about listings that appeared while it was off.
    if (enabled) watch.lastSeenFingerprints = [];
    await watch.save();
    return ok({ watch: shape(watch) });
}

export async function deleteVendingWatch(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    watchId: string,
) {
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, "vending-search", "vending.watch");
    if (!auth.ok) return auth;
    const watch = await resolveOwnWatch(auth.data.team._id, watchId);
    if (!watch) return fail(404, "Watch not found");
    await watch.deleteOne();
    return ok({ ok: true });
}

