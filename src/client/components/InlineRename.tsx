import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";

/** A device's name, click-to-edit in place (pencil -> text input -> Enter/checkmark to submit,
 *  Escape/X to cancel). `subtitle` is rendered small and muted next to the name (e.g. the raw id). */
export function InlineRename({
    name,
    subtitle,
    onRename,
}: {
    name: string;
    subtitle?: string;
    onRename: (name: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(name);
    const [submitting, setSubmitting] = useState(false);

    const cancel = () => {
        setEditing(false);
        setValue(name);
    };

    const submit = async () => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === name) return cancel();
        setSubmitting(true);
        await onRename(trimmed);
        setSubmitting(false);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex min-w-0 items-center gap-1.5">
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") submit();
                        if (e.key === "Escape") cancel();
                    }}
                    disabled={submitting}
                    maxLength={100}
                    className="w-32 min-w-0 rounded-md border border-border bg-canvas px-2 py-0.5 text-xs text-white focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <button onClick={submit} disabled={submitting} className="shrink-0 text-neutral-400 transition-colors hover:text-accent">
                    <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancel} disabled={submitting} className="shrink-0 text-neutral-500 transition-colors hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    return (
        <button onClick={() => setEditing(true)} className="group flex min-w-0 items-center gap-1.5 text-left">
            <span className="truncate text-sm text-neutral-200">{name}</span>
            {subtitle && <span className="shrink-0 font-mono text-[10px] text-neutral-600">{subtitle}</span>}
            <Pencil className="h-3 w-3 shrink-0 text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
    );
}
