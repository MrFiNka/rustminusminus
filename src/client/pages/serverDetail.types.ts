export interface SwitchState {
    id: string;
    name: string;
    value: boolean;
    /** True when the entity couldn't be read from Rust+ (e.g. destroyed/unpaired in-game). */
    unavailable?: boolean;
}

export interface AlarmState {
    id: string;
    name: string;
    value: boolean;
    lastTriggered: string | null;
    unavailable?: boolean;
}

export interface StorageItem {
    itemId: number;
    name: string;
    shortName: string;
    quantity: number;
    isBlueprint: boolean;
}

export type StorageEntity =
    | { id: string; name: string; kind: "cupboard"; hasProtection: boolean; protectionExpiry: number | null; capacity: number; items: StorageItem[]; unavailable?: boolean }
    | { id: string; name: string; kind: "storage"; capacity: number; items: StorageItem[]; unavailable?: boolean };

export interface MapEvent {
    type: string;
    label: string;
    grid: string;
}

export interface ServerSnapshot {
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapName: string;
    wipeTime: number;
    switches: SwitchState[];
    alarms: AlarmState[];
    storage: StorageEntity[];
    activeEvents: MapEvent[];
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export interface MapMonument {
    token: string;
    /** Resolved server-side from the raw token, so the client never deals in tokens. */
    label: string;
    x: number;
    y: number;
}

/** Response of GET .../servers/:serverId/map-meta - the overlay's half of the map. */
export interface MapMeta {
    /** Pixel dimensions of the rendered JPEG. */
    width: number;
    height: number;
    /** Ocean padding around the playable world, in *world* units. */
    oceanMargin: number;
    /** Playable world size, in world units - a different scale from width/height. */
    mapSize: number;
    monuments: MapMonument[];
}

/** One marker pushed over the live socket. No `sellOrders` - the market panel loads those itself. */
export interface LiveMarker {
    id: number;
    type: number;
    /** e.g. "CargoShip", "VendingMachine" - the AppMarkerType name, resolved server-side. */
    typeName: string;
    x: number;
    y: number;
    name?: string;
    rotation?: number;
    steamId?: string;
    outOfStock?: boolean;
}

/** A teammate's position. There is no rotation on team members (only on player markers), so these
 *  render as dots rather than facing arrows. */
export interface LiveTeamMember {
    steamId: string;
    name: string;
    x: number;
    y: number;
    isOnline: boolean;
    isAlive: boolean;
}

/** A team map note. Rust sends a type and a position only - there is no label to show. */
export interface LiveMapNote {
    type: number;
    x: number;
    y: number;
}

export interface LiveTeamInfo {
    members: LiveTeamMember[];
    mapNotes: LiveMapNote[];
    leaderMapNotes: LiveMapNote[];
}

export interface LiveMarkerState {
    markers: LiveMarker[];
    fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export interface VendingOrder {
    machineId: number;
    machineName?: string;
    x: number;
    y: number;
    grid: string;
    itemId: number;
    itemName: string;
    itemShortName: string;
    /** Units per purchase - the reason cost-per-unit needs computing rather than reading. */
    quantity: number;
    /** Price of one purchase (of `quantity` units). */
    costPerItem: number;
    currencyId: number;
    currencyName: string;
    currencyShortName: string;
    /** Zero means listed but sold out - shown greyed rather than hidden. */
    amountInStock: number;
    itemIsBlueprint: boolean;
    currencyIsBlueprint: boolean;
    itemCondition?: number;
    itemConditionMax?: number;
}

export interface VendingMachine {
    machineId: number;
    name?: string;
    x: number;
    y: number;
    grid: string;
    orders: VendingOrder[];
}

export interface MarketSnapshot {
    machines: VendingMachine[];
    fetchedAt: number;
    mapSize: number;
}

/** Neither of these is an error: vending data needs a live connection, and only the active server
 *  has one. The panel explains rather than showing a failure banner. */
export type MarketUnavailable = "not-active-server" | "not-connected";

export type MarketResponse = MarketSnapshot | { unavailable: MarketUnavailable };

/** A saved query that alerts in Discord when a matching listing shows up. */
export interface VendingWatch {
    id: string;
    serverId: string;
    query: string;
    side: "sell" | "buy" | "both";
    maxPrice: number | null;
    currencyId: number | null;
    channelId: string | null;
    createdBy: string;
    enabled: boolean;
    lastAlertedAt: string | null;
}

export interface ServerDetailResponse {
    serverId: string;
    name: string;
    img: string | null;
    url: string | null;
    ip: string | null;
    port: string | null;
    isActive: boolean;
    enabledModules: string[];
    /** Whether the session holds `vending.watch` for this team - drives whether the market panel
     *  offers watch controls. The write routes enforce it independently. */
    canManageWatches: boolean;
    pairedItems: { smartSwitch: string[]; smartAlarm: string[]; storageMonitor: string[] };
    live: ServerSnapshot | null;
    liveError: string | null;
}
