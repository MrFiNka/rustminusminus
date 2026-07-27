import { columnLabel, gridCell } from "./mapProjection";

export { GRID_CELL_SIZE } from "./mapProjection";

/**
 * Converts world x/y into Rust's letter+number grid notation (e.g. "K14"), matching the in-game
 * F1 map overlay. `mapSize` must be `AppInfo.mapSize` - NOT `AppMap.width`/`height`, which are the
 * rendered map image's pixel dimensions, a different scale entirely.
 *
 * The cell math itself lives in mapProjection.ts, shared with the map overlay's grid lines - so a
 * pin drawn inside the "K14" box is a pin this function also calls K14.
 */
export function toGridReference(x: number, y: number, mapSize: number): string {
    const { col, row } = gridCell({ x, y }, mapSize);
    return `${columnLabel(col)}${row}`;
}
