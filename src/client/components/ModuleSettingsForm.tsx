import { useState } from "react";
import { Toggle } from "./Toggle";

export interface SettingField {
    key: string;
    label: string;
    type: "boolean" | "string" | "number" | "select";
    default?: unknown;
    description?: string;
    min?: number;
    max?: number;
    options?: { label: string; value: string }[];
}

export interface SettingsModule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    schema: SettingField[];
    values: Record<string, unknown>;
}

const inputClass =
    "w-40 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50";

/** Schema-driven settings form for one module. Holds its own edit buffer and PATCHes on Save. */
export function ModuleSettingsForm({
    module,
    onSave,
}: {
    module: SettingsModule;
    onSave: (moduleId: string, values: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}) {
    const [values, setValues] = useState<Record<string, unknown>>(module.values);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const update = (key: string, value: unknown) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        const result = await onSave(module.id, values);
        setSaving(false);
        if (!result.ok) {
            setError(result.error ?? "Failed to save");
            return;
        }
        setSaved(true);
    };

    return (
        <div className="flex flex-col gap-4 p-4">
            {!module.enabled && (
                <p className="rounded-md bg-surface-hover px-3 py-2 text-xs text-neutral-400">
                    This module is disabled — these settings take effect once you enable it in Modules.
                </p>
            )}
            {module.schema.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-4">
                    <div>
                        <label className="text-sm text-neutral-200">{field.label}</label>
                        {field.description && <p className="mt-0.5 text-xs text-neutral-500">{field.description}</p>}
                    </div>
                    <div className="shrink-0">
                        {field.type === "boolean" && (
                            <Toggle checked={values[field.key] === true} onChange={(checked) => update(field.key, checked)} />
                        )}
                        {field.type === "number" && (
                            <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                value={values[field.key] === undefined || values[field.key] === null ? "" : String(values[field.key])}
                                onChange={(e) => update(field.key, e.target.value === "" ? "" : Number(e.target.value))}
                                disabled={saving}
                                className={inputClass}
                            />
                        )}
                        {field.type === "string" && (
                            <input
                                type="text"
                                value={values[field.key] === undefined || values[field.key] === null ? "" : String(values[field.key])}
                                onChange={(e) => update(field.key, e.target.value)}
                                disabled={saving}
                                className={inputClass}
                            />
                        )}
                        {field.type === "select" && (
                            <select
                                value={values[field.key] === undefined || values[field.key] === null ? "" : String(values[field.key])}
                                onChange={(e) => update(field.key, e.target.value)}
                                disabled={saving}
                                className={inputClass}
                            >
                                {field.options?.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            ))}
            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save"}
                </button>
                {error && <span className="text-xs text-red-400">{error}</span>}
                {saved && !error && <span className="text-xs text-emerald-400">Saved</span>}
            </div>
        </div>
    );
}
