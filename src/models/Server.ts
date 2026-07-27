import { Document, model, Schema, Types } from "mongoose";

const ServerSchema = new Schema({
    serverId: { type: String, required: true },
    name: { type: String, required: true },
    img: { type: String, required: true },
    url: { type: String, required: true },
    ip: { type: String, required: true },
    port: { type: String, required: true }
}, { timestamps: true });

export class ServerClass extends Document<Types.ObjectId> {
    serverId!: string;
    name!: string;
    img!: string;
    url!: string;
    ip!: string;
    port!: string;
}

ServerSchema.loadClass(ServerClass);

export const ServerModel = model<ServerClass>("Server", ServerSchema);