import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { AppEntityPayload, AppTeamInfo, AppTeamMessage, RustPlus, TeamDiffEvent } from "rustminus";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";
import type { MapMarkerEvent } from "../rustplus/mapMarkerDiff";
import type { PermissionId } from "../permissions/definitions";

/** Where a module can be toggled. A module declares its natural scope; the effective enabled
 *  check for a "team"-scoped module is: team override if present, else guild value, else
 *  defaultEnabled. */
export type ModuleScope = "global" | "guild" | "team";

export interface ModuleContext {
    rustplus: RustPlus;
    team: TeamClass;
    guild: GuildClass;
}

export interface InGameCommand {
    name: string;
    /** Return true if `body` (the raw team-chat message text) is this command. Runs per chat message.
     *  `prefix` is the team's configured chat prefix (see Team.getChatPrefix) - build trigger checks
     *  against it rather than hardcoding "!". */
    match: (body: string, prefix: string) => boolean;
    /** If set, the sending player must hold this permission for the team (team-scoped grant or a
     *  guild-wide one) or the command is refused. Absent = open to anyone in the team chat. */
    permission?: PermissionId;
    execute: (
        ctx: ModuleContext & {
            message: AppTeamMessage;
            args: string;
            /** The team's chat prefix - needed by commands that slice it off the argument text. */
            prefix: string;
            reply: (text: string) => Promise<void>;
        },
    ) => void | Promise<void>;
}

export interface ModuleDiscordCommand {
    name: string;
    slashCommand: SlashCommandBuilder;
    command: (interaction: ChatInputCommandInteraction) => void | Promise<void>;
}

export interface ModuleSettingField {
    key: string;
    label: string;
    type: "boolean" | "string" | "number" | "select";
    default?: unknown;
    /** Optional help text shown under the field in the settings form. */
    description?: string;
    /** For type "number": inclusive bounds, used for the input's min/max and server-side validation. */
    min?: number;
    max?: number;
    /** For type "select": the allowed options. A submitted value must be one of these `value`s. */
    options?: { label: string; value: string }[];
}

export interface RustModule {
    id: string;
    name: string;
    description: string;
    scope: ModuleScope;
    defaultEnabled: boolean;

    discordCommands?: ModuleDiscordCommand[];
    inGameCommands?: InGameCommand[];
    settingsSchema?: ModuleSettingField[];

    // ---- passive runtime hooks (only invoked while enabled for that team) ----
    onTeamMessage?(ctx: ModuleContext & { message: AppTeamMessage }): void | Promise<void>;
    onTeamChanged?(ctx: ModuleContext & { info: AppTeamInfo; changes: TeamDiffEvent[] }): void | Promise<void>;
    onEntityChanged?(ctx: ModuleContext & { entityId: number; payload: AppEntityPayload }): void | Promise<void>;
    /** Fired for each spawn/despawn event whenever any enabled module declares this hook - see
     *  EventDispatcher's map-marker polling loop (there's no Rust+ push event for markers). */
    onMapEvent?(ctx: ModuleContext & { event: MapMarkerEvent }): void | Promise<void>;
    /** Fired on a fixed interval per live connection, independent of any Rust+ push/poll event -
     *  for modules that just need to refresh something periodically (e.g. a live info panel). */
    onTick?(ctx: ModuleContext): void | Promise<void>;

    // ---- lifecycle (fired on toggle) ----
    onEnable?(scope: { guildId?: string; teamId?: string }): void | Promise<void>;
    onDisable?(scope: { guildId?: string; teamId?: string }): void | Promise<void>;
}
