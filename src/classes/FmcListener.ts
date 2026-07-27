import {
    FcmListener as RustFcmListener,
    classifyNotification,
    parseEntityType,
    AppEntityType,
    type FcmCredentials,
    type FcmNotificationBody,
    type RustPlusNotification,
} from "rustminus";
import { UserModel } from "../models/User";
import { ServerModel } from "../models/Server";
import { TeamModel } from "../models/Team";
import { asyncFilter } from "../utils";
import { getActiveRustplus, invalidateTeam } from "../rustplus/connections";
import { addLiveEntity } from "../rustplus/serverSnapshot";

// idea from https://github.com/alexemanuelol/rustplusplus

const ENTITY_TYPE_TO_PAIRED_ITEMS_KEY: Record<AppEntityType, "smartSwitch" | "smartAlarm" | "storageMonitor"> = {
    [AppEntityType.Switch]: "smartSwitch",
    [AppEntityType.Alarm]: "smartAlarm",
    [AppEntityType.StorageMonitor]: "storageMonitor",
};

export class FmcListener {
    listener?: RustFcmListener;
    static activeListeners: Map<string, FmcListener> = new Map();
    constructor(public androidId: string, public securityToken: string, public userId: string) {
    }
    static async userListen(userId: string) {
        // stop any previously running listener for this user so we never leak sockets
        this.activeListeners.get(userId.toString())?.stopListen();
        let userData = await UserModel.findOne({ userId });
        if (!userData) return null;
        let { gcm_android_id, gcm_security_token } = userData.credentials;
        let listener = new FmcListener(gcm_android_id, gcm_security_token, userId);
        this.activeListeners.set(userId.toString(), listener);
        listener.listen();
    }
    static async userStopListen(userId: string) {
        this.activeListeners.get(userId.toString())?.stopListen();
    }
    static async ListenToAll() {
        let users = await UserModel.find({ credentials: { $exists: true } });
        for (let user of users) {
            await this.userListen(user.userId);
        }
    }
    stopListen() {
        FmcListener.activeListeners.delete(this.userId.toString());
        this.listener?.disconnect();
        delete this.listener;
    }
    async pairEntity(serverId: string, entityId: string, pairedItemsKey: "smartSwitch" | "smartAlarm" | "storageMonitor") {
        let teams = await TeamModel.find({ activeServerId: serverId });
        teams = await asyncFilter(teams, async (team) => {
            let users = await team.getUsers();
            return !!users.find(e => e.userId == this.userId);
        });
        for (let team of teams) {
            let server = team.servers.find(e => e.serverId == team.activeServerId);
            if (!server) continue;
            if (server.pairedItems[pairedItemsKey].find(e => e.id == entityId)) continue;
            server.pairedItems[pairedItemsKey].push({ id: entityId });
            await team.save();
            // Modules read paired devices off a cached team document - drop it so a device paired
            // in-game is visible to them immediately, not just to the live dashboard snapshot below.
            invalidateTeam(team._id);
            // Read the new entity's current state once and hand it to the live snapshot store so it
            // shows up on any open dashboard page without a reload (and without a full RCON rebuild).
            const info = await getActiveRustplus(team._id)?.getEntityInfo(Number(entityId)).catch(() => undefined);
            await addLiveEntity(team, serverId, pairedItemsKey, entityId, info?.payload);
        }
        console.log('FCM', `pairing: entity: ${pairedItemsKey}`);
    }
    async handlePairingServer(body: FcmNotificationBody) {
        if (!body.id) return;
        console.log('FCM', `pairing: server`);
        let userData = await UserModel.findOne({ userId: this.userId });
        let serverCred = userData?.credentials.servers.find(e => e.serverId == body.id);
        if (!serverCred) {
            userData?.credentials.servers.push({
                serverId: body.id,
                playerToken: body.playerToken ?? ""
            });
        } else {
            serverCred.playerToken = body.playerToken ?? "";
        }
        await userData?.save();
        let server = await ServerModel.findOne({ serverId: body.id });
        if (!server) {
            await ServerModel.create({
                serverId: body.id,
                name: body.name,
                img: body.img,
                url: body.url,
                ip: body.ip,
                port: body.port
            });
        }
        // add the newly-paired server to every team this user is a member of
        if (userData) {
            let teams = await TeamModel.find({ users: userData._id });
            for (let team of teams) {
                if (team.servers.find(e => e.serverId == body.id)) continue;
                team.servers.push({
                    serverId: body.id,
                    pairedItems: { smartSwitch: [], smartAlarm: [], storageMonitor: [] }
                });
                await team.save();
            }
        }
    }
    async handlePairingEntity(body: FcmNotificationBody) {
        if (!body.id || !body.entityId) return;
        // pairing the entity to ALL teams that has this user in his team and that has this server as active
        const entityType = parseEntityType(body);
        if (entityType === undefined) {
            console.log('FCM', `pairing: entity: other\n${JSON.stringify(body)}`);
            return;
        }
        const pairedItemsKey = ENTITY_TYPE_TO_PAIRED_ITEMS_KEY[entityType];
        await this.pairEntity(body.id, body.entityId, pairedItemsKey);
    }
    listen() {
        if (this.listener) {
            this.listener.disconnect();
            delete this.listener;
        }
        const credentials: FcmCredentials = {
            gcm: { androidId: this.androidId, securityToken: this.securityToken },
            // fcm.token is unused by rustminus's FcmListener.connect() (verified in
            // node_modules/rustminus/dist/fcm/FcmListener.js - only gcm.androidId/securityToken
            // are read) and isn't persisted anywhere in UserModel. Placeholder only to satisfy
            // the type; revisit if a future rustminus version starts reading it.
            fcm: { token: "" },
        };
        this.listener = new RustFcmListener(credentials);
        this.listener.on('connected', () => console.log('FCM', 'connected'));
        this.listener.on('disconnected', () => console.log('FCM', 'disconnected'));
        this.listener.on('rustplusNotification', async (notification: RustPlusNotification) => {
            switch (classifyNotification(notification)) {
                case 'pairing-server':
                    await this.handlePairingServer(notification.body);
                    break;

                case 'pairing-entity':
                    await this.handlePairingEntity(notification.body);
                    break;

                case 'alarm':
                    console.log('FCM', `alarm: alarm`);
                    break;

                case 'player-death':
                    console.log('FCM', `player: death`);
                    break;

                case 'team-login':
                    console.log('FCM', `team: login`);
                    break;

                case 'unknown':
                default:
                    console.log('FCM', `other\n${JSON.stringify(notification)}`);
                    break;
            }
        });
        this.listener.connect();
    }
}
