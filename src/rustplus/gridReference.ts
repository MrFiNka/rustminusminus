const GRID_CELL_SIZE = 146.3;

function columnLabel(col: number): string {
    let label = "";
    let n = col;
    do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return label;
}

/**
 * Converts world x/y into Rust's letter+number grid notation (e.g. "K14"), matching the in-game
 * F1 map overlay. `mapSize` must be `AppInfo.mapSize` - NOT `AppMap.width`/`height`, which are the
 * rendered map image's pixel dimensions, a different scale entirely.
 */
export function toGridReference(x: number, y: number, mapSize: number): string {
    const columns = Math.ceil(mapSize / GRID_CELL_SIZE);
    const col = Math.max(0, Math.min(columns - 1, Math.floor(x / GRID_CELL_SIZE)));
    const row = Math.max(0, Math.min(columns - 1, columns - 1 - Math.floor(y / GRID_CELL_SIZE)));
    return `${columnLabel(col)}${row}`;
}
