import type { RustPlus } from "rustminus";
import { DiscordBot } from "../classes/DiscordBot";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";
import type { ModuleDiscordCommand, RustModule } from "./types";
import { EnablementCache } from "./EnablementCache";
import { EventDispatcher } from "./EventDispatcher";

/**
 * Central module registry: owns which modules exist and the Discord command bookkeeping that
 * spans both registration and enablement state (which command belongs to which module, per-guild
 * command names). Enablement-state caching is delegated to EnablementCache and connection
 * listener lifecycle/dispatch to EventDispatcher - see their own doc comments.
 */
class ModuleRegistry {
    private modules = new Map<string, RustModule>();
    private enablementCache = new EnablementCache(this);
    private dispatcher = new EventDispatcher(this, (teamId) => this.enablementCache.enabledModuleIdsForTeam(teamId));
    /** Built lazily and reused - see moduleDiscordCommandOwners. Cleared whenever a module registers. */
    private commandOwners?: Map<string, RustModule>;

    register(mod: RustModule): void {
        this.modules.set(mod.id, mod);
        this.commandOwners = undefined;
    }

    all(): RustModule[] {
        return [...this.modules.values()];
    }

    get(id: string): RustModule | undefined {
        return this.modules.get(id);
    }

    async primeGlobal(): Promise<void> {
        await this.enablementCache.primeGlobal();
    }

    isEnabledGlobally(moduleId: string): boolean {
        return this.enablementCache.isEnabledGlobally(moduleId);
    }

    primeGuild(guild: GuildClass): void {
        this.enablementCache.primeGuild(guild);
    }

    isEnabledForTeam(moduleId: string, team: TeamClass): boolean {
        return this.enablementCache.isEnabledForTeam(moduleId, team);
    }

    isEnabledForGuild(moduleId: string, guildId: string): boolean {
        return this.enablementCache.isEnabledForGuild(moduleId, guildId);
    }

    /** Union of module command names enabled for a guild, for per-guild slash command registration. */
    discordCommandNamesForGuild(guildId: string): Set<string> {
        const enabled = this.enablementCache.enabledModuleIdsForGuild(guildId);
        const names = new Set<string>();
        for (const mod of this.all()) {
            if (!enabled.has(mod.id)) continue;
            for (const cmd of mod.discordCommands ?? []) names.add(cmd.name);
        }
        return names;
    }

    /** Map of Discord command name -> owning module, for interaction dispatch. Memoized: the module
     *  set only changes at startup, but this is called on every single interaction. */
    moduleDiscordCommandOwners(): Map<string, RustModule> {
        if (!this.commandOwners) {
            this.commandOwners = new Map<string, RustModule>();
            for (const mod of this.all()) {
                for (const cmd of mod.discordCommands ?? []) this.commandOwners.set(cmd.name, mod);
            }
        }
        return this.commandOwners;
    }

    /** Flat list of every module-owned Discord command, regardless of guild/enabled state. */
    allDiscordCommands(): ModuleDiscordCommand[] {
        return this.all().flatMap((mod) => mod.discordCommands ?? []);
    }

    attach(rustplus: RustPlus, team: TeamClass, guild: GuildClass): void {
        this.enablementCache.primeTeam(team, guild);
        this.enablementCache.primeGuild(guild);
        this.dispatcher.attach(rustplus, team, guild);
    }

    detach(rustplus: RustPlus): void {
        this.dispatcher.detach(rustplus);
    }

    /**
     * Persists a module's enabled state, refreshes the relevant cache(s), fires the module's
     * onEnable/onDisable lifecycle hook, and (for guild/team scope) re-syncs that guild's Discord
     * slash commands live.
     */
    async setEnabled(moduleId: string, scope: { guildId?: string; teamId?: string }, enabled: boolean): Promise<void> {
        const persisted = await this.enablementCache.setEnabledPersisted(moduleId, scope, enabled);
        if (!persisted) return;

        const mod = this.modules.get(moduleId);
        const hookScope = scope.guildId ? scope : {};
        if (enabled) await mod?.onEnable?.(hookScope);
        else await mod?.onDisable?.(hookScope);

        if (scope.guildId) await DiscordBot.Instance.registerGuildCommands(scope.guildId);
    }
}

export const registry = new ModuleRegistry();
