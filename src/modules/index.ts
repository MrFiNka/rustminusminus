import { registry } from "./ModuleRegistry";
import { crossTeamChat } from "./cross-team-chat/index";
import { teamTracker } from "./team-tracker/index";
import { smartSwitches } from "./smart-switches/index";
import { smartAlarms } from "./smart-alarms/index";
import { storageMonitors } from "./storage-monitors/index";
import { chatRelay } from "./chat-relay/index";
import { serverInfoPanel } from "./server-info-panel/index";
import { mapEvents } from "./map-events/index";
import { raidAlerts } from "./raid-alerts/index";
import { vendingSearch } from "./vending-search/index";
import type { RustModule } from "./types";

export const modules: RustModule[] = [
    crossTeamChat,
    teamTracker,
    smartSwitches,
    smartAlarms,
    storageMonitors,
    chatRelay,
    serverInfoPanel,
    mapEvents,
    raidAlerts,
    vendingSearch,
];

for (const mod of modules) {
    registry.register(mod);
}
