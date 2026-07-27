import { Document, model, Schema, Types } from "mongoose";

const ChatLinkSchema = new Schema(
    {
        guildId: { type: String, required: true },
        name: { type: String, required: true },
        teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    },
    { timestamps: true },
);

export class ChatLinkClass extends Document<Types.ObjectId> {
    guildId!: string;
    name!: string;
    teamIds!: Types.ObjectId[];
    createdAt!: Date;
    updatedAt!: Date;
}

ChatLinkSchema.loadClass(ChatLinkClass);

export const ChatLinkModel = model<ChatLinkClass>("ChatLink", ChatLinkSchema);
