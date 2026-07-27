import { X } from "lucide-react";
import type { LiveMarker, VendingMachine } from "../../pages/serverDetail.types";
import type { MarkerStyle } from "./layers";

export interface MapSelection {
    marker: LiveMarker;
    style: MarkerStyle;
}

/**
 * Detail card for a clicked marker.
 *
 * For a vending machine it shows the shop's whole stock, taken from the market snapshot the panel
 * has already loaded rather than fetched again - the two features share one payload, which is the
 * point of loading the whole market up front.
 */
export function MarkerPopover({
    selection,
    machine,
    grid,
    onClose,
}: {
    selection: MapSelection;
    machine: VendingMachine | null;
    grid: string;
    onClose: () => void;
}) {
    const { marker, style } = selection;
    const title = marker.name?.trim() || style.label;

    return (
        <div
            data-map-interactive
            className="absolute bottom-2 right-2 z-10 max-h-[60%] w-64 overflow-y-auto rounded-lg border border-border bg-surface/95 p-3 text-sm shadow-lg backdrop-blur"
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-medium text-white">{title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: style.fill }} />
                        {style.label} · <span className="font-mono">{grid}</span>
                    </p>
                </div>
                <button onClick={onClose} className="shrink-0 text-neutral-500 transition-colors hover:text-white">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {machine && (
                machine.orders.length === 0 ? (
                    <p className="text-xs text-neutral-600">This machine has no listings.</p>
                ) : (
                    <ul className="flex flex-col gap-1">
                        {machine.orders.map((order, i) => (
                            <li
                                key={`${order.itemId}-${order.currencyId}-${i}`}
                                className={`rounded-md bg-surface-hover px-2 py-1 text-xs ${order.amountInStock <= 0 ? "opacity-45" : ""}`}
                            >
                                <span className="text-neutral-200">
                                    {order.itemName}
                                    {order.itemIsBlueprint ? " (BP)" : ""} ×{order.quantity}
                                </span>
                                <span className="text-neutral-500">
                                    {" "}for {order.costPerItem} {order.currencyName}
                                </span>
                                <span className="text-neutral-600">
                                    {" "}· {order.amountInStock > 0 ? `${order.amountInStock} in stock` : "out of stock"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )
            )}

            {!machine && style.layer === "vending" && (
                <p className="text-xs text-neutral-600">Stock for this machine hasn&apos;t loaded yet.</p>
            )}
        </div>
    );
}
