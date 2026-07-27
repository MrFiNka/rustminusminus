import type { TeamClass } from "../../models/Team";
import { registry } from "../ModuleRegistry";
import { getModuleSettingById, setModuleSettings } from "../moduleSettings";

const MODULE_ID = "raid-alerts";
const DEFAULT_RADIUS_METERS = 100;

/** Thin compatibility wrappers over the generic module-settings store (same `radiusMeters` key), kept
 *  so the `/raidalert radius` Discord command can read/write the value without knowing the schema. */
export function getRadiusMeters(team: TeamClass): number {
    const radius = getModuleSettingById<number>(team, MODULE_ID, "radiusMeters");
    return typeof radius === "number" && radius > 0 ? radius : DEFAULT_RADIUS_METERS;
}

export async function setRadiusMeters(team: TeamClass, radiusMeters: number): Promise<void> {
    const module = registry.get(MODULE_ID);
    if (!module) return;
    await setModuleSettings(team, module, { radiusMeters });
}
