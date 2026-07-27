import { Document, model, Schema, Types } from "mongoose";

/**
 * A saved market query that alerts when something matching it shows up.
 *
 * Scoped to one team *and* one server: vending machines are wipe- and server-specific, so a watch
 * that outlived its server would fire against a market its owner never meant.
 */
const VendingWatchSchema = new Schema(
    {
        teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
        serverId: { type: String, required: true },
        /** Free-text item query, matched the same way the browser's filter box matches. */
        query: { type: String, required: true },
        /** Which side of the trade to match: shops selling it, shops paying in it, or both. */
        side: { type: String, enum: ["sell", "buy", "both"], default: "sell" },
        /** Only alert at or below this price *per unit*. Unset = any price. */
        maxPrice: { type: Number, default: null },
        /** Only alert when paid for in this item. Unset = any currency. */
        currencyId: { type: Number, default: null },
        /** Discord channel for the alert. Unset = the team's events channel. */
        channelId: { type: String, default: null },
        createdBy: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        /**
         * Fingerprints (`machineId:itemId:costPerItem`) of the orders that matched on the last
         * evaluation. This is what makes alerting edge-triggered: only fingerprints that are matching
         * *now* and were not matching *last time* fire. Without it a watch on "Sheet Metal Door under
         * 50 scrap" would alert every poll for as long as such a listing exists.
         */
        lastSeenFingerprints: { type: [String], default: [] },
        lastAlertedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

export class VendingWatchClass extends Document<Types.ObjectId> {
    teamId!: Types.ObjectId;
    serverId!: string;
    query!: string;
    side!: "sell" | "buy" | "both";
    maxPrice!: number | null;
    currencyId!: number | null;
    channelId!: string | null;
    createdBy!: string;
    enabled!: boolean;
    lastSeenFingerprints!: string[];
    lastAlertedAt!: Date | null;
    createdAt!: Date;
    updatedAt!: Date;
}

VendingWatchSchema.loadClass(VendingWatchClass);

export const VendingWatchModel = model<VendingWatchClass>("VendingWatch", VendingWatchSchema);
