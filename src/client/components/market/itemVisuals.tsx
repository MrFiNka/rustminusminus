import type { VendingOrder } from "../../pages/serverDetail.types";

/**
 * The in-game item sprite.
 *
 * Shared rather than inlined because the same CDN convention is now used in three places (the
 * listing row, the item card, the item detail header), and a blank short name has to degrade to
 * nothing in all of them.
 */
export function ItemIcon({ shortName, className = "h-4 w-4" }: { shortName: string; className?: string }) {
    if (!shortName) return null;
    return (
        <img
            src={`https://cdn.carbonmod.gg/items/${shortName}.png`}
            alt=""
            loading="lazy"
            className={`${className} shrink-0 object-contain`}
        />
    );
}

/** Marks a listing as the blueprint rather than the item it teaches - a different good entirely. */
export function BlueprintBadge() {
    return <span className="shrink-0 rounded bg-sky-500/15 px-1 py-px text-[10px] font-medium text-sky-300">BP</span>;
}

/** Remaining condition on a used item, shown only when it's below the maximum. */
export function ConditionBadge({ order }: { order: VendingOrder }) {
    return (
        <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-300">
            {Math.round((order.itemCondition! / order.itemConditionMax!) * 100)}%
        </span>
    );
}
