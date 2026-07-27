import { getBotSettings } from "../models/BotSettings";
import { GuildModel, type GuildClass } from "../models/Guild";
import { TeamModel, type TeamClass } from "../models/Team";
import { invalidateTeam } from "../rustplus/connections";
import type { RustModule } from "./types";

/** What EnablementCache needs from the module registry - just enough to compute enabled sets. */
export interface ModuleLookup {
    all(): RustModule[];
    get(id: string): RustModule | undefined;
}

/**
 * Owns the in-memory enabled/disabled state for every module at every scope (global/guild/team),
 * via in-memory caches kept fresh on toggle (see setEnabledPersisted). This only persists state
 * and refreshes these caches - ModuleRegistry.setEnabled is the public entry point that also
 * fires lifecycle hooks and re-syncs Discord commands once persistence here succeeds.
 */
export class EnablementCache {
    private globalEnabled = new Map<string, boolean>(); // moduleId -> explicit global override
    private teamEnabled = new Map<string, Set<string>>(); // teamId.toString() -> enabled moduleIds (effective)
    private guildEnabled = new Map<string, Set<string>>(); // guildId (Discord guild id string) -> enabled moduleIds

    constructor(private readonly modules: ModuleLookup) {}

    /** Load global module overrides from BotSettings into the in-memory cache. */
    async primeGlobal(): Promise<void> {
        const settings = await getBotSettings();
        for (const entry of settings.modules) {
            this.globalEnabled.set(entry.moduleId, entry.enabled);
        }
    }

    /** Effective global enabled state: explicit override, else defaultEnabled. */
    isEnabledGlobally(moduleId: string): boolean {
        const override = this.globalEnabled.get(moduleId);
        return override !== undefined ? override : (this.modules.get(moduleId)?.defaultEnabled ?? false);
    }

    /** Effective per-team enabled set: team override > guild override > global override > defaultEnabled. */
    private computeTeamEnabledSet(team: TeamClass, guild: GuildClass): Set<string> {
        const set = new Set<string>();
        for (const mod of this.modules.all()) {
            const teamOverride = team.modules?.find((m) => m.moduleId === mod.id);
            const guildOverride = guild.modules?.find((m) => m.moduleId === mod.id);
            const globalOverride = this.globalEnabled.get(mod.id);
            const enabled = teamOverride
                ? teamOverride.enabled
                : guildOverride
                    ? guildOverride.enabled
                    : globalOverride !== undefined
                        ? globalOverride
                        : mod.defaultEnabled;
            if (enabled) set.add(mod.id);
        }
        return set;
    }

    /** Guild-level enabled set, used to gate per-guild Discord command registration. */
    private computeGuildEnabledSet(guild: GuildClass): Set<string> {
        const set = new Set<string>();
        for (const mod of this.modules.all()) {
            const guildOverride = guild.modules?.find((m) => m.moduleId === mod.id);
            const globalOverride = this.globalEnabled.get(mod.id);
            const enabled = guildOverride
                ? guildOverride.enabled
                : globalOverride !== undefined
                    ? globalOverride
                    : mod.defaultEnabled;
            if (enabled) set.add(mod.id);
        }
        return set;
    }

    primeGuild(guild: GuildClass): void {
        this.guildEnabled.set(guild.guildId, this.computeGuildEnabledSet(guild));
    }

    /** Recomputes and stores a team's effective enabled set - called on connect and on toggle. */
    primeTeam(team: TeamClass, guild: GuildClass): void {
        this.teamEnabled.set(team._id.toString(), this.computeTeamEnabledSet(team, guild));
    }

    isEnabledForTeam(moduleId: string, team: TeamClass): boolean {
        return this.teamEnabled.get(team._id.toString())?.has(moduleId) ?? false;
    }

    isEnabledForGuild(moduleId: string, guildId: string): boolean {
        return this.guildEnabled.get(guildId)?.has(moduleId) ?? false;
    }

    enabledModuleIdsForTeam(teamId: string): Set<string> {
        return this.teamEnabled.get(teamId) ?? new Set<string>();
    }

    enabledModuleIdsForGuild(guildId: string): Set<string> {
        return this.guildEnabled.get(guildId) ?? new Set<string>();
    }

    /**
     * Persists a module's enabled state at the given scope and refreshes the relevant cache(s).
     * Returns false (nothing persisted) if the target team/guild doesn't exist - callers should
     * skip lifecycle hooks and command re-sync in that case, same as before this was split out.
     *
     * scope.guildId omitted = global scope (stored in BotSettings, updates globalEnabled cache).
     */
    async setEnabledPersisted(moduleId: string, scope: { guildId?: string; teamId?: string }, enabled: boolean): Promise<boolean> {
        if (!scope.guildId) {
            const settings = await getBotSettings();
            const existing = settings.modules?.find((m) => m.moduleId === moduleId);
            if (existing) existing.enabled = enabled;
            else settings.modules.push({ moduleId, enabled });
            await settings.save();
            this.globalEnabled.set(moduleId, enabled);
            return true;
        }

        if (scope.teamId) {
            const team = await TeamModel.findById(scope.teamId);
            if (!team) return false;
            const existing = team.modules?.find((m) => m.moduleId === moduleId);
            if (existing) existing.enabled = enabled;
            else team.modules.push({ moduleId, enabled, settings: {} });
            await team.save();
            invalidateTeam(team._id);
            const guild = await team.getGuild();
            if (guild) this.primeTeam(team, guild);
            return true;
        }

        const guild = await GuildModel.findOne({ guildId: scope.guildId });
        if (!guild) return false;
        const existing = guild.modules?.find((m) => m.moduleId === moduleId);
        if (existing) existing.enabled = enabled;
        else guild.modules.push({ moduleId, enabled, settings: {} });
        await guild.save();
        this.primeGuild(guild);
        return true;
    }
}
