import { describe, expect, test } from "bun:test";
import {
    GRID_CELL_SIZE,
    gridCell,
    gridCellCentre,
    gridColumns,
    gridOverlay,
    columnLabel,
    pixelToWorld,
    scaleGeometry,
    worldToPixel,
    type MapGeometry,
} from "./mapProjection";
import { toGridReference } from "./gridReference";

/**
 * Real geometry, read off a live server (procedural 5650 map). Kept as the primary fixture because
 * the relationship between these four numbers is exactly what the transform used to get wrong:
 * `oceanMargin` is *pixels* of padding in the image, so the playable world occupies
 * `3825 - 2*500 = 2825` px - a clean 2 world units per pixel. It is NOT world units added to the
 * world span (`5650 + 2*500 = 6650`, nothing like the 3825 the image actually is).
 */
const geometry: MapGeometry = { mapSize: 5650, imageWidth: 3825, imageHeight: 3825, oceanMargin: 500 };
const PLAYABLE_PX = 3825 - 2 * 500;

describe("worldToPixel", () => {
    test("world origin sits inside the image by exactly the ocean margin, in pixels", () => {
        const { px, py } = worldToPixel({ x: 0, y: 0 }, geometry);
        expect(px).toBeCloseTo(500, 6);
        // world (0,0) is the SOUTH-west corner, so it's near the BOTTOM of the image
        expect(py).toBeCloseTo(3825 - 500, 6);
    });

    test("the far corner of the playable world is inset by the ocean margin too", () => {
        const { px, py } = worldToPixel({ x: 5650, y: 5650 }, geometry);
        expect(px).toBeCloseTo(3825 - 500, 6);
        expect(py).toBeCloseTo(500, 6);
    });

    test("the world centre is the image centre", () => {
        const { px, py } = worldToPixel({ x: 2825, y: 2825 }, geometry);
        expect(px).toBeCloseTo(1912.5, 6);
        expect(py).toBeCloseTo(1912.5, 6);
    });

    test("this server's map is exactly 2 world units per pixel", () => {
        const a = worldToPixel({ x: 0, y: 0 }, geometry);
        const b = worldToPixel({ x: 100, y: 0 }, geometry);
        expect(b.px - a.px).toBeCloseTo(50, 6);
        expect(PLAYABLE_PX * 2).toBe(geometry.mapSize);
    });

    test("the y axis is flipped - world north is a smaller pixel y", () => {
        const south = worldToPixel({ x: 2825, y: 100 }, geometry);
        const north = worldToPixel({ x: 2825, y: 5500 }, geometry);
        expect(north.py).toBeLessThan(south.py);
        // ...while x is not flipped: world east is a larger pixel x
        const west = worldToPixel({ x: 100, y: 2825 }, geometry);
        const east = worldToPixel({ x: 5500, y: 2825 }, geometry);
        expect(east.px).toBeGreaterThan(west.px);
    });

    test("negative world coordinates land in the ocean margin, not off the image", () => {
        // Small oil rig on this server really is at x = -308.9.
        const { px } = worldToPixel({ x: -308.9, y: 1769.2 }, geometry);
        expect(px).toBeGreaterThan(0);
        expect(px).toBeLessThan(geometry.oceanMargin);
    });

    /**
     * Regression guard for the offset bug: these three monuments were checked by eye against the
     * server's own rendered JPEG. The previous transform put every one of them in open water, ~15%
     * of their distance from the map centre too far out (about 1.4 grid cells half way to the edge).
     * Expressed as a fraction of the image so it reads the same way it was verified.
     */
    test("known monuments project onto the features the server drew for them", () => {
        const cases = [
            { name: "Launch Site", world: { x: 1070.5, y: 1672.4 }, u: 0.2707, v: 0.6507 },
            { name: "Harbor 2", world: { x: 410.1, y: 4475.7 }, u: 0.1843, v: 0.2842 },
            { name: "The Dome", world: { x: 482.7, y: 3429.0 }, u: 0.1938, v: 0.4211 },
        ];
        for (const { name, world, u, v } of cases) {
            const { px, py } = worldToPixel(world, geometry);
            expect(px / geometry.imageWidth, name).toBeCloseTo(u, 3);
            expect(py / geometry.imageHeight, name).toBeCloseTo(v, 3);
        }
    });
});

describe("pixelToWorld", () => {
    test("round-trips worldToPixel", () => {
        for (const point of [{ x: 0, y: 0 }, { x: 5650, y: 5650 }, { x: 1234.5, y: 987.25 }, { x: -308.9, y: 5900 }]) {
            const back = pixelToWorld(worldToPixel(point, geometry), geometry);
            expect(back.x).toBeCloseTo(point.x, 6);
            expect(back.y).toBeCloseTo(point.y, 6);
        }
    });

    test("the image corners are the world bounds plus the margin's worth of ocean", () => {
        // 500 px of margin at 2 world units per pixel = 1000 world units of ocean on each side.
        const topLeft = pixelToWorld({ px: 0, py: 0 }, geometry);
        expect(topLeft.x).toBeCloseTo(-1000, 6);
        expect(topLeft.y).toBeCloseTo(6650, 6);

        const bottomRight = pixelToWorld({ px: 3825, py: 3825 }, geometry);
        expect(bottomRight.x).toBeCloseTo(6650, 6);
        expect(bottomRight.y).toBeCloseTo(-1000, 6);
    });
});

describe("scaleGeometry", () => {
    test("projecting against a rescaled image gives proportionally the same point", () => {
        const point = { x: 1234.5, y: 987.25 };
        const reported = worldToPixel(point, geometry);
        const natural = worldToPixel(point, scaleGeometry(geometry, 7650, 7650));
        expect(natural.px).toBeCloseTo(reported.px * 2, 6);
        expect(natural.py).toBeCloseTo(reported.py * 2, 6);
    });

    /** The margin is a pixel measurement, so rescaling the image without rescaling it would move
     *  every point - the exact class of bug this whole module exists to contain. */
    test("scales the ocean margin along with the image", () => {
        expect(scaleGeometry(geometry, 7650, 7650).oceanMargin).toBeCloseTo(1000, 6);
    });
});

describe("grid", () => {
    test("columnLabel rolls over past Z the way Rust does", () => {
        expect(columnLabel(0)).toBe("A");
        expect(columnLabel(25)).toBe("Z");
        expect(columnLabel(26)).toBe("AA");
        expect(columnLabel(27)).toBe("AB");
        expect(columnLabel(51)).toBe("AZ");
        expect(columnLabel(52)).toBe("BA");
    });

    test("a 4000-unit map has 28 grid columns", () => {
        expect(gridColumns(4000)).toBe(28);
    });

    test("cells are clamped to the playable area, so ocean positions land on the edge cell", () => {
        expect(gridCell({ x: -400, y: 4400 }, 4000)).toEqual({ col: 0, row: 0 });
        expect(gridCell({ x: 4400, y: -400 }, 4000)).toEqual({ col: 27, row: 27 });
    });

    test("row 0 is the NORTH edge - increasing world y decreases the row number", () => {
        const north = gridCell({ x: 2000, y: 3990 }, 4000);
        const south = gridCell({ x: 2000, y: 10 }, 4000);
        expect(north.row).toBeLessThan(south.row);
    });

    test("toGridReference is unchanged by the move onto mapProjection", () => {
        // Spot values computed from the pre-refactor implementation.
        expect(toGridReference(0, 4000, 4000)).toBe("A0");
        expect(toGridReference(0, 0, 4000)).toBe("A27");
        expect(toGridReference(1500, 2000, 4000)).toBe("K14");
        expect(toGridReference(3999, 1, 4000)).toBe("AB27");
    });
});

describe("gridCellCentre", () => {
    test("round-trips through toGridReference for every cell on the map", () => {
        const columns = gridColumns(4000);
        for (let col = 0; col < columns; col++) {
            for (let row = 0; row < columns; row++) {
                const reference = `${columnLabel(col)}${row}`;
                const centre = gridCellCentre(reference, 4000)!;
                expect(toGridReference(centre.x, centre.y, 4000)).toBe(reference);
            }
        }
    });

    test("accepts lowercase and surrounding whitespace, as a URL param might carry", () => {
        expect(gridCellCentre(" k14 ", 4000)).toEqual(gridCellCentre("K14", 4000));
    });

    test("rejects references that aren't on a map this size, rather than clamping", () => {
        expect(gridCellCentre("A99", 4000)).toBeNull();
        expect(gridCellCentre("ZZ0", 4000)).toBeNull();
        expect(gridCellCentre("K", 4000)).toBeNull();
        expect(gridCellCentre("14", 4000)).toBeNull();
        expect(gridCellCentre("", 4000)).toBeNull();
    });
});

describe("gridOverlay", () => {
    const overlay = gridOverlay(geometry);

    test("draws one line per cell plus a closing line on each axis", () => {
        const columns = gridColumns(geometry.mapSize);
        expect(overlay.columns).toHaveLength(columns + 1);
        expect(overlay.rows).toHaveLength(columns + 1);
        expect(overlay.columns.at(-1)?.label).toBeUndefined();
        expect(overlay.rows.at(-1)?.label).toBeUndefined();
    });

    test("labels run A.. across and 0.. down, matching the in-game F1 map", () => {
        expect(overlay.columns[0]?.label).toBe("A");
        expect(overlay.columns[10]?.label).toBe("K");
        expect(overlay.rows[0]?.label).toBe("0");
        expect(overlay.rows[13]?.label).toBe("13");
    });

    test("lines advance monotonically, one cell apart in pixel space", () => {
        const cellPx = (GRID_CELL_SIZE / geometry.mapSize) * PLAYABLE_PX;
        for (let i = 1; i < overlay.columns.length; i++) {
            expect(overlay.columns[i]!.offset - overlay.columns[i - 1]!.offset).toBeCloseTo(cellPx, 6);
            expect(overlay.rows[i]!.offset - overlay.rows[i - 1]!.offset).toBeCloseTo(cellPx, 6);
        }
    });

    /**
     * The regression that matters: a point drawn inside the box the overlay labels "K13" must be a
     * point toGridReference also calls "K13". If the two ever disagree, pins land in the wrong
     * labelled cell even though the projection itself round-trips fine.
     */
    test("a point inside a drawn cell gets that cell's grid reference", () => {
        for (const [col, row] of [[10, 13], [0, 0], [27, 27], [3, 25], [10, 14]] as const) {
            // Centre of the box the overlay actually draws, taken from its own adjacent lines rather
            // than from an assumed cell width.
            const px = (overlay.columns[col]!.offset + overlay.columns[col + 1]!.offset) / 2;
            const py = (overlay.rows[row]!.offset + overlay.rows[row + 1]!.offset) / 2;
            const centre = pixelToWorld({ px, py }, geometry);
            expect(toGridReference(centre.x, centre.y, geometry.mapSize)).toBe(
                `${columnLabel(col)}${row}`,
            );
        }
    });
});
