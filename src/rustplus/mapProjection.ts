/**
 * World <-> map-image coordinate math, and the grid geometry both the in-game F1 overlay and this
 * bot's grid references are built on.
 *
 * This is the load-bearing piece for anything drawn on the map: every marker, grid line and vending
 * pin inherits its error, and a subtly wrong transform shows up as "the pins drift toward the
 * corners". It lives in one module so the client overlay and `toGridReference` can't disagree.
 *
 * Deliberately dependency-free - it's imported by both server code and the browser bundle (the same
 * shared-module role src/routeTree.tsx plays), so nothing from mongoose/discord.js may reach it.
 */

/** Side length of one grid cell in world units - Rust's F1 map divides the world on this. */
export const GRID_CELL_SIZE = 146.3;

/**
 * Everything needed to place a world position on the rendered map image.
 *
 * Two traps this type exists to prevent:
 *
 * 1. `mapSize` is `AppInfo.mapSize`, in *world units*, while `imageWidth`/`imageHeight` are
 *    `AppMap.width`/`height`, in *pixels*. Different scales, easy to mix up.
 * 2. `oceanMargin` (`AppMap.oceanMargin`) is in **pixels**, not world units. It is padding baked
 *    into the image, not extra world shown around the playable area. Measured on a live server:
 *    mapSize 5650, width 3825, oceanMargin 500 - so the playable world occupies
 *    `3825 - 2*500 = 2825` px, i.e. exactly 2 world units per pixel. Note `mapSize + 2*oceanMargin`
 *    (6650) is nothing like `width` (3825); treating the margin as world units stretches every
 *    overlay outward from the map centre by ~15% of its distance from centre.
 */
export interface MapGeometry {
    mapSize: number;
    imageWidth: number;
    imageHeight: number;
    oceanMargin: number;
}

export interface PixelPoint { px: number; py: number }
export interface WorldPoint { x: number; y: number }

/** Pixels the playable world occupies on each axis, i.e. the image minus its ocean padding. */
function playableSize(geometry: MapGeometry): { width: number; height: number } {
    return {
        width: geometry.imageWidth - 2 * geometry.oceanMargin,
        height: geometry.imageHeight - 2 * geometry.oceanMargin,
    };
}

/**
 * World position -> pixel position on the map image.
 *
 * Two things make this more than a scale factor: the playable world is inset into the image by
 * `oceanMargin` pixels on every side, and the y axis is flipped (world y grows north, image y grows
 * down). World (0,0) is therefore the *bottom-left of the inset area*, not of the image.
 */
export function worldToPixel(point: WorldPoint, geometry: MapGeometry): PixelPoint {
    const playable = playableSize(geometry);
    return {
        px: geometry.oceanMargin + (point.x / geometry.mapSize) * playable.width,
        py: geometry.imageHeight - geometry.oceanMargin - (point.y / geometry.mapSize) * playable.height,
    };
}

/** Inverse of {@link worldToPixel} - for the cursor grid readout and click-to-locate. */
export function pixelToWorld(point: PixelPoint, geometry: MapGeometry): WorldPoint {
    const playable = playableSize(geometry);
    return {
        x: ((point.px - geometry.oceanMargin) / playable.width) * geometry.mapSize,
        y: ((geometry.imageHeight - geometry.oceanMargin - point.py) / playable.height) * geometry.mapSize,
    };
}

/**
 * Rescales a geometry to a different image size, keeping the world mapping intact.
 *
 * `AppMap.width`/`height` are what the server *reports*; the browser must draw against the loaded
 * image's `naturalWidth`/`naturalHeight`. They normally agree, but when they don't, projecting with
 * the reported size against the actual bitmap drifts every pin - so the client rescales instead of
 * assuming.
 *
 * `oceanMargin` is scaled along with them: it's a pixel measurement, so it only means anything
 * relative to the image size it was reported for.
 */
export function scaleGeometry(geometry: MapGeometry, imageWidth: number, imageHeight: number): MapGeometry {
    return {
        ...geometry,
        imageWidth,
        imageHeight,
        oceanMargin: geometry.oceanMargin * (imageWidth / geometry.imageWidth),
    };
}

/** Number of grid columns (and rows - Rust's grid is square) for a map of this world size. */
export function gridColumns(mapSize: number): number {
    return Math.ceil(mapSize / GRID_CELL_SIZE);
}

/** Grid column index -> Rust's letter label ("A", "B", ... "Z", "AA", "AB", ...). */
export function columnLabel(col: number): string {
    let label = "";
    let n = col;
    do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return label;
}

/** Grid cell containing a world position, clamped to the playable area (positions out in the ocean
 *  margin belong to the nearest edge cell, which is what the in-game map shows too). */
export function gridCell(point: WorldPoint, mapSize: number): { col: number; row: number } {
    const columns = gridColumns(mapSize);
    return {
        col: Math.max(0, Math.min(columns - 1, Math.floor(point.x / GRID_CELL_SIZE))),
        row: Math.max(0, Math.min(columns - 1, columns - 1 - Math.floor(point.y / GRID_CELL_SIZE))),
    };
}

/**
 * World position at the centre of a grid reference like "K14" - the inverse of `toGridReference`,
 * used by `?focus=<grid>` deep links so a Discord alert's grid string can become a clickable spot.
 *
 * Returns null for anything that isn't a valid reference on a map this size, rather than clamping a
 * nonsense input to a real-looking location.
 */
export function gridCellCentre(reference: string, mapSize: number): WorldPoint | null {
    const match = /^([A-Za-z]+)(\d+)$/.exec(reference.trim());
    if (!match) return null;

    // Inverse of columnLabel's bijective base-26: "A"=0, "Z"=25, "AA"=26.
    let col = 0;
    for (const ch of match[1]!.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    col -= 1;

    const row = Number(match[2]);
    const columns = gridColumns(mapSize);
    if (col < 0 || col >= columns || row < 0 || row >= columns) return null;

    return {
        x: (col + 0.5) * GRID_CELL_SIZE,
        // Rows count from the north, so row `row` is `columns - 1 - row` cells north of the origin.
        y: (columns - 1 - row + 0.5) * GRID_CELL_SIZE,
    };
}

export interface GridLine {
    /** Pixel offset along the axis this line runs perpendicular to. */
    offset: number;
    /** Label for the cell that *starts* at this line ("A".."Z" for columns, "0".."n" for rows).
     *  Undefined on the final closing line, which starts no cell. */
    label?: string;
}

export interface GridOverlay {
    /** Vertical lines, at pixel x offsets, labelled with their column letter. */
    columns: GridLine[];
    /** Horizontal lines, at pixel y offsets, labelled with their row number. */
    rows: GridLine[];
}

/**
 * Pixel-space grid lines and labels for the map overlay, matching the in-game F1 map.
 *
 * Built from the same anchoring {@link gridCell} uses, so a pin sitting inside the drawn "K14" box
 * is a pin `toGridReference` also calls K14. Includes the closing line on each axis (label-less) so
 * the last cell is boxed rather than open-ended.
 *
 * The grid is anchored at world 0 and counts whole cells, so `gridColumns * GRID_CELL_SIZE` usually
 * *overhangs* `mapSize` (4000 world units is 27.34 cells, rounded up to 28). Rows are numbered from
 * the top, which is why row `i` runs from `(columns - 1 - i)` to `(columns - i)` cells north of the
 * origin rather than being measured down from `mapSize` - anchoring them at `mapSize` instead puts
 * every row label off by one against the grid reference for the same spot.
 */
export function gridOverlay(geometry: MapGeometry): GridOverlay {
    const columns = gridColumns(geometry.mapSize);
    const columnLines: GridLine[] = [];
    const rowLines: GridLine[] = [];

    for (let i = 0; i <= columns; i++) {
        // Columns run west->east in both world and pixel space, so line i is simply i cells east.
        const vertical = worldToPixel({ x: i * GRID_CELL_SIZE, y: 0 }, geometry);
        // Rows are drawn top-down while world y grows north, so line i is (columns - i) cells north.
        const horizontal = worldToPixel({ x: 0, y: (columns - i) * GRID_CELL_SIZE }, geometry);
        columnLines.push({ offset: vertical.px, label: i < columns ? columnLabel(i) : undefined });
        rowLines.push({ offset: horizontal.py, label: i < columns ? String(i) : undefined });
    }

    return { columns: columnLines, rows: rowLines };
}
