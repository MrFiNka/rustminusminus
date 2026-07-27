export type PermissionId =
    | "modules.manage"
    | "chatlinks.manage"
    | "switches.toggle"
    | "alarms.manage"
    | "raidalerts.manage"
    | "storagemonitors.manage"
    | "mapevents.manage"
    | "activeserver.manage"
    | "activecredential.manage"
    | "teammembers.manage";

export interface PermissionDefinition {
    id: PermissionId;
    label: string;
    description: string;
    status: "enforced" | "reserved";
    /** True if this permission governs a team-scoped action, so it can be granted per team (a
     *  team-scoped group) as well as guild-wide. False/absent = only meaningful guild-wide. */
    teamScoped?: boolean;
}

export const PERMISSIONS: PermissionDefinition[] = [
    {
        id: "modules.manage",
        label: "Manage modules",
        description: "Enable/disable modules per guild or team.",
        status: "enforced",
    },
    {
        id: "chatlinks.manage",
        label: "Manage chat links",
        description: "Create/edit cross-team chat link groups.",
        status: "enforced",
    },
    {
        id: "switches.toggle",
        label: "Toggle switches",
        description: "Toggle and rename paired smart switches.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "alarms.manage",
        label: "Manage alarms",
        description: "Rename and list paired smart alarms.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "raidalerts.manage",
        label: "Manage raid alerts",
        description: "Configure the raid-alert proximity radius.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "storagemonitors.manage",
        label: "Manage storage monitors",
        description: "Rename and list paired storage monitors/tool cupboards.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "mapevents.manage",
        label: "Manage map events",
        description: "Reserved — no map-events module yet.",
        status: "reserved",
    },
    {
        id: "activeserver.manage",
        label: "Change active server",
        description: "Switch which server a team is actively connected to.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "activecredential.manage",
        label: "Change active credential",
        description: "Choose which member's Rust+ credentials the team connects with.",
        status: "enforced",
        teamScoped: true,
    },
    {
        id: "teammembers.manage",
        label: "Manage team members",
        description: "Add and remove members from a team (/team adduser, /team removeuser).",
        status: "enforced",
        teamScoped: true,
    },
];
