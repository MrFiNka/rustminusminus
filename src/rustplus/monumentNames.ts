/**
 * Display names for the monument tokens `AppMap.monuments` carries.
 *
 * Rust sends raw tokens ("launchsite", "airfield_display_name", "train_tunnel_display_name"), which
 * are not presentable as-is. This is the curated half; {@link monumentLabel} falls back to a
 * derived name for anything not listed, so a Rust update that adds a monument shows a readable
 * label instead of a raw token rather than needing a code change to render at all.
 *
 * Same shape and role as markerLabels.ts, which does this for marker types.
 */
export const MONUMENT_LABELS: Record<string, string> = {
    // --- tier-3 / safe zones ---
    launchsite: "Launch Site",
    airfield_display_name: "Airfield",
    military_tunnels_display_name: "Military Tunnel",
    excavator: "Giant Excavator Pit",
    water_treatment_plant_display_name: "Water Treatment Plant",
    train_yard_display_name: "Train Yard",
    power_plant_display_name: "Power Plant",
    sewer_display_name: "Sewer Branch",
    satellite_dish_display_name: "Satellite Dish",
    junkyard_display_name: "Junkyard",
    arctic_base_display_name: "Arctic Research Base",
    missile_silo_monument: "Missile Silo",
    ferryterminal: "Ferry Terminal",
    nuclear_missile_silo: "Missile Silo",

    // --- safe zones / outposts ---
    outpost: "Outpost",
    bandit_camp: "Bandit Camp",
    fishing_village_display_name: "Fishing Village",
    large_fishing_village_display_name: "Large Fishing Village",
    stables_a: "Ranch",
    stables_b: "Large Barn",

    // --- small / roadside ---
    lighthouse_display_name: "Lighthouse",
    supermarket: "Abandoned Supermarket",
    mining_outpost_display_name: "Mining Outpost",
    mining_quarry_hqm_display_name: "HQM Quarry",
    mining_quarry_stone_display_name: "Stone Quarry",
    mining_quarry_sulfur_display_name: "Sulfur Quarry",
    gas_station: "Oxum's Gas Station",
    warehouse: "Abandoned Warehouse",
    swamp_c: "Abandoned Cabins",
    oil_rig_small: "Small Oil Rig",
    large_oil_rig: "Large Oil Rig",
    underwater_lab: "Underwater Lab",
    harbor_display_name: "Harbor",
    harbor_2_display_name: "Large Harbor",
    radtown_small_display_name: "Sphere Tank",
    radtown_display_name: "Radtown",
    dome_monument_name: "The Dome",
    military_base_a: "Abandoned Military Base",
    military_base_b: "Abandoned Military Base",
    military_base_c: "Abandoned Military Base",
    military_base_d: "Abandoned Military Base",
    desert_military_base_a: "Desert Military Base",
    desert_military_base_b: "Desert Military Base",
    desert_military_base_c: "Desert Military Base",
    desert_military_base_d: "Desert Military Base",

    // --- transit / terrain features ---
    train_tunnel_display_name: "Train Tunnel",
    train_tunnel_link_display_name: "Train Tunnel Link",
    underground_display_name: "Underground",
    cave: "Cave",
    ice_lake_display_name: "Ice Lake",
    power_substation: "Power Substation",
    water_well_a: "Water Well",
    water_well_b: "Water Well",
    water_well_c: "Water Well",
    water_well_d: "Water Well",
    water_well_e: "Water Well",
    AbandonedMilitaryBase: "Abandoned Military Base",
};

/** Tokens Rust suffixes to mark a display string; stripped before the fallback derives a name. */
const TOKEN_SUFFIXES = ["_display_name", "_monument_name", "_monument", "_name"];

/**
 * Display name for a monument token: the curated name if there is one, otherwise a derived one
 * (suffix stripped, underscores split, title-cased). "harbor_2_display_name" -> "Harbor 2".
 *
 * The fallback is deliberately never wrong-but-confident - it only ever reformats what the server
 * said, so an unrecognised monument reads a little plainly rather than being mislabelled.
 */
export function monumentLabel(token: string): string {
    const known = MONUMENT_LABELS[token];
    if (known) return known;

    let base = token;
    for (const suffix of TOKEN_SUFFIXES) {
        if (base.endsWith(suffix)) {
            base = base.slice(0, -suffix.length);
            break;
        }
    }

    return base
        // split snake_case and camelCase alike - Rust sends both ("AbandonedMilitaryBase")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[_\s]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        || token;
}
