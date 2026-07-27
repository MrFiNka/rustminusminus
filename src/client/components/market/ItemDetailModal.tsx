import { useEffect } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { isDamaged, priceLabel } from "./marketFilters";
import { isSoldOut, type ItemCard } from "./itemAggregation";
import { BlueprintBadge, ConditionBadge, ItemIcon } from "./itemVisuals";

/** Stable identity for "nothing highlighted", matching ItemCardGrid. */
const NONE: readonly number[] = [];

/** World units are metres, so a shop across the map reads better in kilometres. */
function formatDistance(distance: number): string {
    return distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`;
}

/**
 * Every shop selling one item, with its price - the answer the shop-grouped list could only give by
 * filtering to the item and reading ten expanded rows.
 *
 * Structured after Lightbox: a fixed backdrop that closes on click or Escape, with the panel itself
 * swallowing clicks. Lightbox isn't reused directly - it renders an image and nothing else.
 */
export function ItemDetailModal({
    item,
    origin,
    onClose,
    onFocusMachine,
    onHighlightMachines,
    onWatch,
    watched,
    watchBusy,
}: {
    item: ItemCard;
    /** Team centroid. When known, each shop shows how far away it is. */
    origin: { x: number; y: number } | null;
    onClose: () => void;
    /** Centres the map on a shop. Closes this, since focusing also filters the panel to that shop. */
    onFocusMachine: (machineId: number) => void;
    onHighlightMachines: (machineIds: readonly number[]) => void;
    /** Null when the session lacks `vending.watch` - the button is hidden rather than shown to 401. */
    onWatch: (() => void) | null;
    /** True when a watch for this item already exists, so the button doesn't invite a duplicate. */
    watched: boolean;
    watchBusy: boolean;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Leaving the highlight set on a machine that's no longer shown would strand a ring on the map.
    useEffect(() => () => onHighlightMachines(NONE), [onHighlightMachines]);

    const soldOut = isSoldOut(item);

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={item.name}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-xl"
            >
                <div className="flex items-start gap-3 border-b border-border/60 p-3">
                    <ItemIcon shortName={item.shortName} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-medium text-white">
                            {item.name}
                            {item.isBlueprint && <BlueprintBadge />}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                            {item.shopCount} shop{item.shopCount === 1 ? "" : "s"}
                            {soldOut ? " · sold out everywhere" : ` · ${item.totalStock} in stock`}
                        </p>
                    </div>
                    {onWatch && (
                        <button
                            onClick={onWatch}
                            disabled={watched || watchBusy}
                            title={watched
                                ? "You already have a watch for this item"
                                : "Alert in Discord when this item is listed"}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-neutral-400 transition-colors hover:border-accent hover:text-white disabled:opacity-40"
                        >
                            {watched ? <BellRing className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                            {watched ? "Watching" : "Watch"}
                        </button>
                    )}
                    <button onClick={onClose} className="shrink-0 text-neutral-500 transition-colors hover:text-white">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <ul className="flex flex-col divide-y divide-border/40 overflow-y-auto p-3">
                    {item.orders.map((order, i) => (
                        <li
                            key={`${order.machineId}-${order.currencyId}-${i}`}
                            onMouseEnter={() => onHighlightMachines([order.machineId])}
                            onMouseLeave={() => onHighlightMachines(NONE)}
                        >
                            <button
                                onClick={() => {
                                    onFocusMachine(order.machineId);
                                    onClose();
                                }}
                                title="Show this shop on the map"
                                className={`flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-white ${
                                    order.amountInStock <= 0 ? "opacity-45" : ""
                                }`}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-neutral-200">
                                        {order.machineName?.trim() || "Vending Machine"}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                                        <span className="font-mono">{order.grid}</span>
                                        {origin && (
                                            <span>· {formatDistance(Math.hypot(order.x - origin.x, order.y - origin.y))} away</span>
                                        )}
                                        <span>· ×{order.quantity} per purchase</span>
                                        {isDamaged(order) && <ConditionBadge order={order} />}
                                    </span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block text-sm text-neutral-200">{priceLabel(order)}</span>
                                    <span className="mt-0.5 block text-xs text-neutral-600">
                                        {order.amountInStock > 0 ? `${order.amountInStock} left` : "out of stock"}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
