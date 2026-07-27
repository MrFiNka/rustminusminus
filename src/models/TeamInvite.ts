import { Document, model, Schema, Types } from "mongoose";

/** How long a pending invite stays acceptable. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const TeamInviteSchema = new Schema(
    {
        guildId: { type: String, required: true },
        teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
        /** Discord user id of the person being invited - the ONLY id allowed to press the buttons. */
        inviteeId: { type: String, required: true },
        /** Discord user id of whoever sent it, shown in the DM embed. */
        inviterId: { type: String, required: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true },
);

// The invite row, not the Discord message, is the source of truth: a button press is validated
// against this document rather than against anything encoded in the customId, so a forged or
// forwarded customId can't add anyone. It's also why invites survive a bot restart - there is no
// in-memory collector holding the state.

// Mongo reaps expired invites on its own (~60s cycle). The button handler re-checks expiresAt
// anyway, so an invite that hasn't been swept yet still can't be accepted late.
TeamInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// One pending invite per (team, invitee) - re-inviting refreshes the existing row and re-sends the
// DM rather than accumulating duplicates that would each add the user on accept.
TeamInviteSchema.index({ teamId: 1, inviteeId: 1 }, { unique: true });

export class TeamInviteClass extends Document<Types.ObjectId> {
    guildId!: string;
    teamId!: Types.ObjectId;
    inviteeId!: string;
    inviterId!: string;
    expiresAt!: Date;
    createdAt!: Date;
    updatedAt!: Date;

    isExpired(): boolean {
        return this.expiresAt.getTime() <= Date.now();
    }
}

TeamInviteSchema.loadClass(TeamInviteClass);

export const TeamInviteModel = model<TeamInviteClass>("TeamInvite", TeamInviteSchema);
