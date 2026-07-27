import { useCallback, useEffect, useRef, useState } from "react";

/** Zoom bounds. 1 = the map fitted to the viewport's *width*; below that there's no reason to go,
 *  above 8x a 2000px map image is already well past its own pixel density. */
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
    /** Size of the viewport in CSS pixels - the visible window, which clips the content. */
    viewport: { width: number; height: number };
    /** Size of the map content at scale 1 in CSS pixels: the viewport's width, and whatever height
     *  the map's own aspect implies. Taller than the viewport whenever the viewport is wider than
     *  the map is - which is the case the vertical panning exists for. */
    content: { width: number; height: number };
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
 * The translation range for one axis. When the scaled content overflows the viewport, translation
 * may range over the overhang and no further - which is what stops the "I panned into grey space and
 * lost the map" failure mode. When it *underflows* (the axis is shorter than the window, as height
 * is once you zoom out), it's pinned centred rather than being allowed to drift into a corner.
 */
function translationRange(viewportSize: number, contentSize: number): { min: number; max: number } {
    if (contentSize <= viewportSize) {
        const centre = (viewportSize - contentSize) / 2;
        return { min: centre, max: centre };
    }
    return { min: viewportSize - contentSize, max: 0 };
}

/**
 * Pan/zoom state for the map viewer, attached to a viewport element the caller owns.
 *
 * Works in *normalised map space* (0..1 across the image on each axis) rather than world units or
 * image pixels, so it knows nothing about Rust's projection - callers convert with mapProjection.ts.
 * That keeps the gesture handling independent of map size and image dimensions.
 *
 * The transform is `translate(tx, ty) scale(scale)` over content laid out at `content` size, which
 * is deliberately NOT the viewport size: the content is fitted to the viewport's *width*, so a
 * viewport shorter than the map is tall shows a horizontal band of it and pans vertically, instead
 * of the map being squashed to fit. `contentAspect` (width/height of the map image) is what decides
 * that height - pass it rather than assuming square.
 *
 * The viewport ref is a parameter rather than something this hook returns: bundling a ref into the
 * returned object makes every `view.something` read during render a ref access, which the React
 * compiler (rightly) rejects.
 */
export function useMapView(viewportRef: React.RefObject<HTMLDivElement | null>, contentAspect = 1): MapView {
    const [transform, setTransform] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const content = { width: viewport.width, height: viewport.width / contentAspect };

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

    /** Clamps a transform against the viewport it is displayed in. Takes the viewport size rather
     *  than reading state so the gesture handlers can pass a fresh getBoundingClientRect(). */
    const clampTransform = useCallback((next: ViewTransform, size: { width: number; height: number }): ViewTransform => {
        const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
        const x = translationRange(size.width, size.width * scale);
        const y = translationRange(size.height, (size.width / contentAspect) * scale);
        return {
            scale,
            tx: clamp(next.tx, x.min, x.max),
            ty: clamp(next.ty, y.min, y.max),
        };
    }, [contentAspect]);

    /** Fitted to width, centred on the middle of the map. Not `{1, 0, 0}`: with the content taller
     *  than the viewport that would open hard against the map's top edge. */
    const reset = useCallback(() => setTransform(clampTransform({
        scale: 1,
        tx: 0,
        ty: (viewport.height - viewport.width / contentAspect) / 2,
    }, viewport)), [clampTransform, contentAspect, viewport]);

    // Same centring for the initial view, once the viewport has a measured size to centre within.
    const centred = useRef(false);
    useEffect(() => {
        if (centred.current || viewport.width === 0) return;
        centred.current = true;
        reset();
    }, [reset, viewport.width]);

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
        // Put normalised point (u,v) - which sits at (u*cw*s, v*ch*s) in scaled content space - under
        // the centre of the viewport. Independent of the current transform, so no updater form.
        setTransform(clampTransform({
            scale: next,
            tx: viewport.width / 2 - u * content.width * next,
            ty: viewport.height / 2 - v * content.height * next,
        }, viewport));
    }, [clampTransform, content.height, content.width, viewport]);

    const toMapSpace = useCallback((clientX: number, clientY: number) => {
        const element = viewportRef.current;
        if (!element || content.width === 0 || content.height === 0) return null;
        const rect = element.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        return {
            u: (x - transform.tx) / (content.width * transform.scale),
            v: (y - transform.ty) / (content.height * transform.scale),
        };
    }, [content.height, content.width, transform, viewportRef]);

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

    return { ...transform, viewport, content, isPanning, reset, zoomBy, flyTo, toMapSpace };
}
