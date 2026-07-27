import { Document, model, Schema, Types } from "mongoose";

const CredentialsSchema = {
    gcm_android_id: { type: String, required: true },
    gcm_security_token: { type: String, required: true },
    steam_id: { type: String, required: true },
    issued_date: { type: Number, required: true },
    expire_date: { type: Number, required: true },
    servers: [{ serverId: { type: String, required: true }, playerToken: { type: String, required: true } }]
};

const UserSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    credentials: CredentialsSchema,
}, { timestamps: true });

export class UserClass extends Document<Types.ObjectId> {
    userId!: string;
    credentials!: {
        gcm_android_id: string;
        gcm_security_token: string;
        steam_id: string;
        issued_date: number;
        expire_date: number;
        servers: {
            serverId: string;
            playerToken: string;
        }[];
    };
    createdAt!: Date;
    updatedAt!: Date;
}

// Two Discord accounts must never claim the same Steam id: hasInGamePermission
// (src/permissions/check.ts) resolves in-game command authority via this field, so a duplicate
// would make authority ambiguous. Sparse so users without credentials don't all collide on null.
// The /credentials add handler checks this too and returns a friendly error - this is the backstop
// for races and for writes that don't go through that command.
UserSchema.index({ "credentials.steam_id": 1 }, { unique: true, sparse: true });

UserSchema.loadClass(UserClass);

export const UserModel = model<UserClass>("User", UserSchema);