import type { TeamClass } from "../models/Team";
import { invalidateTeam } from "../rustplus/connections";
import { registry } from "./ModuleRegistry";
import type { ModuleSettingField, RustModule } from "./types";

/** The stored override blob for a module on a team (the `settings` sub-object on `team.modules[]`). */
function storedSettings(team: TeamClass, moduleId: string): Record<string, unknown> {
    return team.modules?.find((m) => m.moduleId === moduleId)?.settings ?? {};
}

/**
 * The effective settings for `module` on `team`: each schema field's `default`, overridden by any
 * value stored in `team.modules[].settings`. Modules read their settings through this so an unset
 * value transparently falls back to the declared default.
 */
export function resolveModuleSettings(team: TeamClass, module: RustModule): Record<string, unknown> {
    const stored = storedSettings(team, module.id);
    const out: Record<string, unknown> = {};
    for (const field of module.settingsSchema ?? []) {
        out[field.key] = field.key in stored ? stored[field.key] : field.default;
    }
    return out;
}

/** Single effective setting value (schema default unless overridden on the team). */
export function getModuleSetting<T = unknown>(team: TeamClass, module: RustModule, key: string): T {
    return resolveModuleSettings(team, module)[key] as T;
}

/** Like `getModuleSetting` but resolves the module from the registry by id - for callers (e.g.
 *  Discord command handlers) that would otherwise have to import a module's index and risk a cycle. */
export function getModuleSettingById<T = unknown>(team: TeamClass, moduleId: string, key: string): T | undefined {
    const module = registry.get(moduleId);
    return module ? (getModuleSetting<T>(team, module, key)) : undefined;
}

// Settings are persisted verbatim into the team document, so a string field needs an upper bound -
// otherwise a single PATCH can write an arbitrarily large blob into Mongo.
const MAX_SETTING_STRING_LENGTH = 256;

/** Coerces/validates one submitted value against its schema field, or returns an error string. */
function coerceValue(field: ModuleSettingField, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
    switch (field.type) {
        case "boolean":
            if (typeof raw !== "boolean") return { ok: false, error: `${field.label} must be true or false` };
            return { ok: true, value: raw };
        case "number": {
            const n = Number(raw);
            if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number` };
            if (field.min !== undefined && n < field.min) return { ok: false, error: `${field.label} must be ≥ ${field.min}` };
            if (field.max !== undefined && n > field.max) return { ok: false, error: `${field.label} must be ≤ ${field.max}` };
            return { ok: true, value: n };
        }
        case "select": {
            const value = String(raw);
            if (!field.options?.some((o) => o.value === value)) return { ok: false, error: `Invalid value for ${field.label}` };
            return { ok: true, value };
        }
        case "string": {
            const value = String(raw);
            if (value.length > MAX_SETTING_STRING_LENGTH) {
                return { ok: false, error: `${field.label} must be at most ${MAX_SETTING_STRING_LENGTH} characters` };
            }
            return { ok: true, value };
        }
    }
}

/**
 * Validates `values` against the module's schema and persists the accepted subset onto the team.
 * Unknown keys are ignored; a single invalid value fails the whole write. Creates the module entry
 * if the team has none yet (mirroring the on/off toggle path in ModuleRegistry.setEnabled).
 */
export async function setModuleSettings(
    team: TeamClass,
    module: RustModule,
    values: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const schema = module.settingsSchema ?? [];
    const accepted: Record<string, unknown> = {};
    for (const field of schema) {
        if (!(field.key in values)) continue;
        const result = coerceValue(field, values[field.key]);
        if (!result.ok) return result;
        accepted[field.key] = result.value;
    }

    let entry = team.modules?.find((m) => m.moduleId === module.id);
    if (!entry) {
        entry = { moduleId: module.id, enabled: team.isModuleEnabled(module.id), settings: {} };
        team.modules.push(entry);
    }
    entry.settings = { ...entry.settings, ...accepted };
    // Mixed sub-paths aren't change-tracked automatically - flag it so Mongoose persists the update.
    team.markModified("modules");
    await team.save();
    // Running modules read their settings off a cached team document - drop it so the new values
    // take effect on the next event rather than at the next reconnect.
    invalidateTeam(team._id);
    return { ok: true };
}
