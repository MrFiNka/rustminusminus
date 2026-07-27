import { describe, expect, test } from "bun:test";
import { MONUMENT_LABELS, monumentLabel } from "./monumentNames";

describe("monumentLabel", () => {
    test("uses the curated name when the token is known", () => {
        expect(monumentLabel("launchsite")).toBe("Launch Site");
        expect(monumentLabel("airfield_display_name")).toBe("Airfield");
        expect(monumentLabel("train_tunnel_display_name")).toBe("Train Tunnel");
    });

    test("derives a readable name for unknown tokens", () => {
        expect(monumentLabel("brand_new_monument_display_name")).toBe("Brand New Monument");
        expect(monumentLabel("some_place")).toBe("Some Place");
        expect(monumentLabel("harbor_9_display_name")).toBe("Harbor 9");
    });

    test("splits camelCase tokens too - Rust sends both conventions", () => {
        expect(monumentLabel("SomeNewFacility")).toBe("Some New Facility");
    });

    test("never returns an empty label", () => {
        expect(monumentLabel("_display_name")).toBe("_display_name");
        expect(monumentLabel("")).toBe("");
    });

    test("curated table has no empty entries", () => {
        for (const [token, label] of Object.entries(MONUMENT_LABELS)) {
            expect(token.length).toBeGreaterThan(0);
            expect(label.length).toBeGreaterThan(0);
        }
    });
});
