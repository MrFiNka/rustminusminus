export type PermissionId =
    | "modules.manage"
    | "chatlinks.manage"
    | "switches.toggle"
    | "alarms.manage"
    | "raidalerts.manage"
    | "storagemonitors.manage"
    | "vending.watch"
    | "mapevents.manage"
    | "activeserver.manage"
    | "activecredential.manage"
    | "teammembers.manage"
    | "teammembers.forceadd"
    | "permissions.manage"
    | "teampermissions.manage"
    | "settings.manage";

export interface PermissionDefinition {
    id: PermissionId;
    label: string;
    description: string;
    status: "enforced" | "reserved";
    /** True if this permission governs a team-scoped action, so it can be granted per team (a
     *  team-scoped group) as well as guild-wide. False/absent = only meaningful guild-wide. */
    teamScoped?: boolean;
}

/**
 * Which permissions may actually be put in a group of this scope. A team-scoped group can only carry
 * team-scoped permissions: every guild-level permission is checked without a teamId (see
 * `resolveUserPermissions`), so putting one in a team group grants nothing and only misleads whoever
 * ticked it. Guild-wide groups can carry anything.
 */
export function grantablePermissions(isTeamScoped: boolean): PermissionDefinition[] {
    return PERMISSIONS.filter(p => p.status === "enforced" && (!isTeamScoped || p.teamScoped));
}

export const PERMISSIONS: PermissionDefinition[] = [
    // Team-scoped so it can also be granted on one team: the guild-level route resolves it WITHOUT a
    // teamId, so a team-scoped grant only ever toggles that team's modules, while a guild-wide grant
    // still covers the guild screen and every team.
    {
        id: "modules.manage",
        label: "Manage modules",
        description: "Enable/disable modules per guild or team.",
        status: "enforced",
        teamScoped: true,
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
    // Browsing the market is open to any team member (no permission, matching /market's lack of a
    // gate). Creating a watch is the part that needs one: it's a mutation that makes the bot post to
    // a Discord channel on a schedule, which is a different kind of act from reading prices.
    {
        id: "vending.watch",
        label: "Manage market watches",
        description: "Create and delete saved vending-machine watches that alert in Discord.",
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
        description: "Invite people to a team and remove its members (/team invite, /team removeuser).",
        status: "enforced",
        teamScoped: true,
    },
    // Deliberately separate from teammembers.manage, and deliberately NOT teamScoped. Skipping the
    // invite means putting someone in a team without their consent, which is a guild-level trust
    // decision - so it can only be granted in a guild-wide group, never a team-scoped one
    // (grantablePermissions filters on teamScoped, so omitting the flag is what enforces that).
    {
        id: "teammembers.forceadd",
        label: "Add team members without an invite",
        description: "Add someone to a team directly, skipping the invite they would otherwise accept.",
        status: "enforced",
    },
    // The two below are deliberately separate, not one "manage permissions": guild-wide groups grant
    // on every team, so handing someone the ability to edit them is a much larger delegation than
    // letting a team lead manage their own team's groups. Splitting them keeps the second possible
    // without implying the first.
    {
        id: "permissions.manage",
        label: "Manage guild permission groups",
        description: "Create, edit and delete guild-wide permission groups, which grant on every team.",
        status: "enforced",
    },
    {
        id: "teampermissions.manage",
        label: "Manage team permission groups",
        description: "Create, edit and delete permission groups scoped to a single team.",
        status: "enforced",
        teamScoped: true,
    },
    // Distinct from modules.manage: that turns a module on or off, this changes how an already-enabled
    // one behaves (plus the team's chat prefix). Being in a team is deliberately no longer enough -
    // a module setting changes what the bot does for everyone on the team.
    {
        id: "settings.manage",
        label: "Manage team settings",
        description: "Change a team's in-game chat prefix and its enabled modules' settings.",
        status: "enforced",
        teamScoped: true,
    },
];
