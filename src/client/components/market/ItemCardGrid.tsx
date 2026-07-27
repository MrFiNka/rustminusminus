import { formatUnitPrice } from "./marketFilters";
import { isSoldOut, machineIds, type ItemCard } from "./itemAggregation";
import { BlueprintBadge, ItemIcon } from "./itemVisuals";

/** Stable identity for "nothing highlighted", so unhovering doesn't churn the map's props. */
const NONE: readonly number[] = [];

/** How many currency lines fit on a card before the rest collapse into a count. */
const PRICE_LINES = 2;

/**
 * Every item on sale, one card each.
 *
 * The card leads with what you compare across shops - how many sell it, and the cheapest per-unit
 * price *in each currency*. One blended "from 45/ea" across Scrap, Cloth and HQM would be a number
 * that exists nowhere in the market, so each currency gets its own line.
 */
export function ItemCardGrid({
    items,
    onSelect,
    onHighlightMachines,
}: {
    items: ItemCard[];
    onSelect: (key: string) => void;
    /** Hovering a card rings every shop selling it on the map. */
    onHighlightMachines: (machineIds: readonly number[]) => void;
}) {
    return (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((item) => {
                const soldOut = isSoldOut(item);
                return (
                    <li key={item.key}>
                        <button
                            onClick={() => onSelect(item.key)}
                            onMouseEnter={() => onHighlightMachines(machineIds(item))}
                            onMouseLeave={() => onHighlightMachines(NONE)}
                            className={`flex h-full w-full flex-col gap-1 rounded-lg border border-border bg-surface/50 p-2 text-left transition-colors hover:border-accent hover:bg-surface-hover ${
                                soldOut ? "opacity-50" : ""
                            }`}
                        >
                            <div className="flex items-start justify-between gap-1">
                                <ItemIcon shortName={item.shortName} className="h-8 w-8" />
                                {item.isBlueprint && <BlueprintBadge />}
                            </div>

                            <span className="truncate text-xs font-medium text-neutral-200" title={item.name}>
                                {item.name}
                            </span>

                            <span className="text-[11px] text-neutral-500">
                                {item.shopCount} shop{item.shopCount === 1 ? "" : "s"}
                                {soldOut ? " · sold out" : ` · ${item.totalStock} left`}
                            </span>

                            <span className="mt-auto flex flex-col pt-0.5">
                                {item.prices.slice(0, PRICE_LINES).map((price) => (
                                    <span key={price.currencyId} className="truncate text-[11px] text-neutral-400">
                                        {formatUnitPrice(price.unitPrice)} {price.currencyName}/ea
                                    </span>
                                ))}
                                {item.prices.length > PRICE_LINES && (
                                    <span className="text-[10px] text-neutral-600">
                                        +{item.prices.length - PRICE_LINES} more
                                        {item.prices.length - PRICE_LINES === 1 ? " currency" : " currencies"}
                                    </span>
                                )}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
