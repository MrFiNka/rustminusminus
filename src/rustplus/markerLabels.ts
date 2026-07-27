import { AppMarkerType } from "rustminus";

export const EVENT_LABELS_BY_MARKER_TYPE: Partial<Record<AppMarkerType, string>> = {
    [AppMarkerType.CargoShip]: "Cargo Ship",
    [AppMarkerType.PatrolHelicopter]: "Patrol Helicopter",
    [AppMarkerType.CH47]: "Chinook",
    [AppMarkerType.Crate]: "Locked Crate",
};
