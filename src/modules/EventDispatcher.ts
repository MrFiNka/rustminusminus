import type { AppEntityPayload, AppMarker, AppTeamInfo, AppTeamMessage, RustPlus, TeamDiffEvent } from "rustminus";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";
import type { ModuleLookup } from "./EnablementCache";
import type { RustModule } from "./types";
import { diffMapMarkers } from "../rustplus/mapMarkerDiff";
import { hasInGamePermission } from "../permissions/check";
import { getFreshGuild, getFreshTeam } from "../rustplus/connections";

interface ConnectionListeners {
    onTeamMessage: (message: AppTeamMessage) => void;
    onTeamChanged: (info: AppTeamInfo, changes: TeamDiffEvent[]) => void;
    onEntityChanged: (entityId: number, payload: AppEntityPayload) => void;
}

/**
 * Deliberately stores *ids*, not documents. Holding the `TeamClass`/`GuildClass` instances captured
 * at attach time meant modules were handed a snapshot frozen at connect: settings changed on the
 * dashboard, a new chat prefix, and devices paired in-game were all invisible until the team
 * reconnected - and the four modules that call `team.save()` were writing back from a stale doc.
 * Each dispatch now resolves the current documents (see resolveContext).
 */
interface ConnectionContext {
    teamId: string;
    guildId: string;
}

// Rust+ has no push event for map markers - this is how often each connection polls
// getMapMarkers() to detect cargo ship/heli/crate/explosion spawns for onMapEvent consumers.
const POLL_INTERVAL_MS = 30_000;

/**
 * Owns the listener lifecycle for each live RustPlus connection and dispatches its events to
 * whichever modules are enabled for that connection's team - checked fresh via
 * `enabledModuleIdsForTeam` on every event, not baked in at attach time. One listener set per
 * connection, attached once at connect and never touched on toggle - toggling only mutates the
 * enabled-set cache these listeners read each time, which is what makes toggling live with no
 * listener leaks or bot restart required.
 */
export class EventDispatcher {
    private connectionListeners = new Map<RustPlus, ConnectionListeners>();
    private connectionContext = new Map<RustPlus, ConnectionContext>();
    private pollTimers = new Map<RustPlus, ReturnType<typeof setInterval>>();
    private markerSnapshots = new Map<RustPlus, AppMarker[] | undefined>();
    private pollInFlight = new Set<RustPlus>();

    constructor(
        private readonly modules: ModuleLookup,
        private readonly enabledModuleIdsForTeam: (teamId: string) => Set<string>,
    ) {}

    /** Current team + guild documents for a connection, or null if either has since been deleted. */
    private async resolveContext(rustplus: RustPlus): Promise<{ team: TeamClass; guild: GuildClass } | null> {
        const ids = this.connectionContext.get(rustplus);
        if (!ids) return null;
        const [team, guild] = await Promise.all([getFreshTeam(ids.teamId), getFreshGuild(ids.guildId)]);
        if (!team || !guild) return null;
        return { team, guild };
    }

    attach(rustplus: RustPlus, team: TeamClass, guild: GuildClass): void {
        this.connectionContext.set(rustplus, { teamId: team._id.toString(), guildId: guild.guildId });

        const onTeamMessage = (message: AppTeamMessage) => void this.dispatchTeamMessage(rustplus, message);
        const onTeamChanged = (info: AppTeamInfo, changes: TeamDiffEvent[]) =>
            void this.dispatchTeamChanged(rustplus, info, changes);
        const onEntityChanged = (entityId: number, payload: AppEntityPayload) =>
            void this.dispatchEntityChanged(rustplus, entityId, payload);

        rustplus.on("teamMessage", onTeamMessage);
        rustplus.on("teamChanged", onTeamChanged);
        rustplus.on("entityChanged", onEntityChanged);
        this.connectionListeners.set(rustplus, { onTeamMessage, onTeamChanged, onEntityChanged });
        this.pollTimers.set(rustplus, setInterval(() => void this.tick(rustplus), POLL_INTERVAL_MS));
    }

    detach(rustplus: RustPlus): void {
        const listeners = this.connectionListeners.get(rustplus);
        if (listeners) {
            rustplus.off("teamMessage", listeners.onTeamMessage);
            rustplus.off("teamChanged", listeners.onTeamChanged);
            rustplus.off("entityChanged", listeners.onEntityChanged);
        }
        this.connectionListeners.delete(rustplus);
        this.connectionContext.delete(rustplus);
        const timer = this.pollTimers.get(rustplus);
        if (timer) clearInterval(timer);
        this.pollTimers.delete(rustplus);
        this.markerSnapshots.delete(rustplus);
        this.pollInFlight.delete(rustplus);
    }

    /** Runs on POLL_INTERVAL_MS for every live connection: fires onTick for enabled modules, and -
     *  only if any enabled module declares onMapEvent - polls/diffs map markers. Skips the tick
     *  entirely if the previous one for this same connection is still running, rather than letting
     *  ticks pile up if Rust+ is slow to respond. */
    private async tick(rustplus: RustPlus): Promise<void> {
        if (this.pollInFlight.has(rustplus)) return;
        this.pollInFlight.add(rustplus);
        try {
            const ctx = await this.resolveContext(rustplus);
            if (!ctx) return;
            const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
            const enabledModules = [...enabled]
                .map(id => this.modules.get(id))
                .filter((mod): mod is RustModule => !!mod);

            for (const mod of enabledModules) {
                if (mod.onTick) await mod.onTick({ rustplus, team: ctx.team, guild: ctx.guild });
            }

            if (enabledModules.some(mod => mod.onMapEvent)) {
                await this.pollMapMarkers(rustplus, ctx, enabledModules);
            }
        } catch (error) {
            console.error("EventDispatcher: poll tick failed", error);
        } finally {
            this.pollInFlight.delete(rustplus);
        }
    }

    private async pollMapMarkers(
        rustplus: RustPlus,
        ctx: { team: TeamClass; guild: GuildClass },
        enabledModules: RustModule[],
    ): Promise<void> {
        const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
        const previous = this.markerSnapshots.get(rustplus);
        const events = diffMapMarkers(previous, markers, info.mapSize);
        this.markerSnapshots.set(rustplus, markers);

        for (const event of events) {
            for (const mod of enabledModules) {
                if (mod.onMapEvent) await mod.onMapEvent({ rustplus, team: ctx.team, guild: ctx.guild, event });
            }
        }
    }

    private async dispatchTeamMessage(rustplus: RustPlus, message: AppTeamMessage): Promise<void> {
        const ctx = await this.resolveContext(rustplus);
        if (!ctx) return;
        const prefix = ctx.team.getChatPrefix();
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (!mod) continue;
            for (const cmd of mod.inGameCommands ?? []) {
                if (cmd.match(message.message, prefix)) {
                    // Team-scoped permission gate: a command that declares `permission` runs only if the
                    // sending player holds it for this team (mirrors the web/Discord checks in-game).
                    if (cmd.permission
                        && !(await hasInGamePermission(ctx.guild.guildId, ctx.team._id, message.steamId, cmd.permission))) {
                        await rustplus.sendTeamMessage("Not authorized");
                        continue;
                    }
                    await cmd.execute({
                        rustplus,
                        team: ctx.team,
                        guild: ctx.guild,
                        message,
                        args: message.message,
                        prefix,
                        reply: (text: string) => rustplus.sendTeamMessage(text),
                    });
                }
            }
            if (mod.onTeamMessage) {
                await mod.onTeamMessage({ rustplus, team: ctx.team, guild: ctx.guild, message });
            }
        }
    }

    private async dispatchTeamChanged(rustplus: RustPlus, info: AppTeamInfo, changes: TeamDiffEvent[]): Promise<void> {
        const ctx = await this.resolveContext(rustplus);
        if (!ctx) return;
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (mod?.onTeamChanged) {
                await mod.onTeamChanged({ rustplus, team: ctx.team, guild: ctx.guild, info, changes });
            }
        }
    }

    private async dispatchEntityChanged(rustplus: RustPlus, entityId: number, payload: AppEntityPayload): Promise<void> {
        const ctx = await this.resolveContext(rustplus);
        if (!ctx) return;
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (mod?.onEntityChanged) {
                await mod.onEntityChanged({ rustplus, team: ctx.team, guild: ctx.guild, entityId, payload });
            }
        }
    }
}
