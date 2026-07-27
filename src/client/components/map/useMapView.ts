import { useCallback, useEffect, useRef, useState } from "react";

/** Zoom bounds. 1 = the whole map fitted to the viewport; below that there's no reason to go, above
 *  8x a 2000px map image is already well past its own pixel density. */
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.15;

export interface ViewTransform {
    scale: number;
    /** Translation in *viewport* pixels, applied after scaling. */
    tx: number;
    ty: number;
}

export interface MapView extends ViewTransform {
    /** Size of the viewport in CSS pixels; the fitted (scale 1) size of the map content. */
    viewport: { width: number; height: number };
    isPanning: boolean;
    reset: () => void;
    zoomBy: (factor: number) => void;
    /** Centre the view on a point given in *normalised map space* (0..1 on each axis) at `scale`. */
    flyTo: (u: number, v: number, scale?: number) => void;
    /** Viewport-relative pixel position -> normalised map space, for cursor readouts and hit tests. */
    toMapSpace: (clientX: number, clientY: number) => { u: number; v: number } | null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Pan/zoom state for the map viewer, attached to a viewport element the caller owns.
 *
 * Works in *normalised map space* (0..1 across the image on each axis) rather than world units or
 * image pixels, so it knows nothing about Rust's projection - callers convert with mapProjection.ts.
 * That keeps the gesture handling independent of map size and image dimensions.
 *
 * The transform is `translate(tx, ty) scale(scale)` over content laid out at viewport size, and
 * translation is clamped so the image edges can never be dragged inside the viewport - which is what
 * stops the "I panned into grey space and lost the map" failure mode.
 *
 * The viewport ref is a parameter rather than something this hook returns: bundling a ref into the
 * returned object makes every `view.something` read during render a ref access, which the React
 * compiler (rightly) rejects.
 */
export function useMapView(viewportRef: React.RefObject<HTMLDivElement | null>): MapView {
    const [transform, setTransform] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [isPanning, setIsPanning] = useState(false);

    // Measure the viewport so pan clamping and flyTo have real dimensions to work with.
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            const box = entry?.contentRect;
            if (box) setViewport({ width: box.width, height: box.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [viewportRef]);

    /** Keeps the scaled content covering the viewport: at scale s the content is s times the
     *  viewport, so translation may range over the overhang and no further. */
    const clampTransform = useCallback((next: ViewTransform, size: { width: number; height: number }): ViewTransform => {
        const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
        const overhangX = size.width * (scale - 1);
        const overhangY = size.height * (scale - 1);
        return {
            scale,
            tx: clamp(next.tx, -overhangX, 0),
            ty: clamp(next.ty, -overhangY, 0),
        };
    }, []);

    const reset = useCallback(() => setTransform({ scale: 1, tx: 0, ty: 0 }), []);

    /** Zooms about the viewport centre - what the +/- buttons and keyboard do. */
    const zoomBy = useCallback((factor: number) => {
        setTransform((prev) => {
            const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
            const ratio = scale / prev.scale;
            // Hold the viewport centre fixed: the point under the centre must stay under the centre.
            const cx = viewport.width / 2;
            const cy = viewport.height / 2;
            return clampTransform({
                scale,
                tx: cx - (cx - prev.tx) * ratio,
                ty: cy - (cy - prev.ty) * ratio,
            }, viewport);
        });
    }, [clampTransform, viewport]);

    const flyTo = useCallback((u: number, v: number, scale = 3) => {
        const next = clamp(scale, MIN_SCALE, MAX_SCALE);
        // Put normalised point (u,v) - which sits at (u*w*s, v*h*s) in scaled content space - under
        // the centre of the viewport. Independent of the current transform, so no updater form.
        setTransform(clampTransform({
            scale: next,
            tx: viewport.width / 2 - u * viewport.width * next,
            ty: viewport.height / 2 - v * viewport.height * next,
        }, viewport));
    }, [clampTransform, viewport]);

    const toMapSpace = useCallback((clientX: number, clientY: number) => {
        const element = viewportRef.current;
        if (!element || viewport.width === 0 || viewport.height === 0) return null;
        const rect = element.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        return {
            u: (x - transform.tx) / (viewport.width * transform.scale),
            v: (y - transform.ty) / (viewport.height * transform.scale),
        };
    }, [transform, viewport, viewportRef]);

    // Wheel zoom is bound natively rather than via onWheel: React attaches passive listeners at the
    // root, which cannot call preventDefault, so a passive handler would zoom the map *and* scroll
    // the page.
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            const cx = event.clientX - rect.left;
            const cy = event.clientY - rect.top;
            setTransform((prev) => {
                const scale = clamp(prev.scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_SCALE, MAX_SCALE);
                const ratio = scale / prev.scale;
                // Anchor at the cursor: whatever is under the pointer stays under the pointer.
                return clampTransform({
                    scale,
                    tx: cx - (cx - prev.tx) * ratio,
                    ty: cy - (cy - prev.ty) * ratio,
                }, { width: rect.width, height: rect.height });
            });
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [clampTransform, viewportRef]);

    // Pointer drag panning, tracked on the window so a drag that leaves the viewport keeps working
    // and always gets its pointerup.
    //
    // The last pointer position lives in a ref and each move applies a *delta* through the state
    // updater. Anchoring to the transform captured at pointerdown instead would put that transform in
    // this effect's deps, so the first move would re-run the effect and wipe the in-progress drag's
    // origin - the pan would stop dead after one event.
    const dragFrom = useRef<{ x: number; y: number } | null>(null);
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;

        const onPointerDown = (event: PointerEvent) => {
            // Left button only, and never start a pan from an interactive overlay element (a marker
            // pin, a control button) - those own their own clicks.
            if (event.button !== 0) return;
            if ((event.target as HTMLElement).closest("[data-map-interactive]")) return;
            dragFrom.current = { x: event.clientX, y: event.clientY };
            setIsPanning(true);
        };
        const onPointerMove = (event: PointerEvent) => {
            const from = dragFrom.current;
            if (!from) return;
            const dx = event.clientX - from.x;
            const dy = event.clientY - from.y;
            dragFrom.current = { x: event.clientX, y: event.clientY };
            const rect = element.getBoundingClientRect();
            setTransform((prev) => clampTransform({
                scale: prev.scale,
                tx: prev.tx + dx,
                ty: prev.ty + dy,
            }, { width: rect.width, height: rect.height }));
        };
        const onPointerUp = () => {
            dragFrom.current = null;
            setIsPanning(false);
        };

        element.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return () => {
            element.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [clampTransform, viewportRef]);

    return { ...transform, viewport, isPanning, reset, zoomBy, flyTo, toMapSpace };
}
