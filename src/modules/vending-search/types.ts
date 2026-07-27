/**
 * Structured vending-machine records.
 *
 * Every field here is already on `AppMarker`/`AppMarker_SellOrder` - the search used to read them
 * and throw all but four away into a display string. Keeping them lets the web browser sort by
 * price-per-unit, pin machines on the map, and tell a blueprint listing apart from the real item at
 * the same price. Chat and Discord get their strings from formatOrder() instead.
 */

/** One sell order on one vending machine. */
export interface VendingOrder {
    /** `AppMarker.id` - stable within a wipe, so orders can be grouped per machine and pinned. */
    machineId: number;
    /** `AppMarker.name` - the shop's own sign, when the owner set one. */
    machineName?: string;
    /** World coordinates of the machine, for map pins. */
    x: number;
    y: number;
    /** Grid reference of the machine, for chat/Discord and grid-area filtering. */
    grid: string;

    itemId: number;
    itemName: string;
    itemShortName: string;
    /** Units handed over per purchase. */
    quantity: number;
    /** Price of one purchase (i.e. of `quantity` units), in `currencyId`. */
    costPerItem: number;
    currencyId: number;
    currencyName: string;
    currencyShortName: string;
    /** Purchases still available. Zero is kept rather than dropped: knowing a shop *usually* sells
     *  rockets is useful when it's empty, and it's the precondition for a restock alert. */
    amountInStock: number;

    itemIsBlueprint: boolean;
    currencyIsBlueprint: boolean;
    /** Present on damageable goods (weapons/tools) - an AK at 40% durability is a different offer
     *  from a fresh one at the same price, and today's output can't tell them apart. */
    itemCondition?: number;
    itemConditionMax?: number;
}

/** One vending machine and everything it's selling. A shop is a coherent thing - ten orders from one
 *  machine should read as one shop, not ten unrelated results. */
export interface VendingMachine {
    machineId: number;
    name?: string;
    x: number;
    y: number;
    grid: string;
    orders: VendingOrder[];
}

/** The whole market at one moment. Small enough (10^2-10^3 orders on a wiped server) to load once
 *  and filter client-side. */
export interface MarketSnapshot {
    machines: VendingMachine[];
    /** Epoch ms of the underlying `getMapMarkers()` call, so the UI can say how stale it is. */
    fetchedAt: number;
    /** `AppInfo.mapSize`, so the client can map grid-area filters and pins without a second call. */
    mapSize: number;
}
