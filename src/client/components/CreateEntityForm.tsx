/** The "creating" state of useCreateEntity, rendered as an inline name input + Create/Cancel form. */
export function CreateEntityForm({
    creating,
    name,
    submitting,
    error,
    placeholder,
    hint,
    onNameChange,
    onSubmit,
    onCancel,
}: {
    creating: boolean;
    name: string;
    submitting: boolean;
    error: string | null;
    placeholder: string;
    hint?: string;
    onNameChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    if (!creating) return null;
    return (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
                <input
                    autoFocus
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                    maxLength={100}
                    placeholder={placeholder}
                    disabled={submitting}
                    className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <button
                    onClick={onSubmit}
                    disabled={submitting || !name.trim()}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                    {submitting ? "Creating…" : "Create"}
                </button>
                <button
                    onClick={onCancel}
                    disabled={submitting}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:text-white disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
            {submitting && hint && <p className="mt-2 text-xs text-neutral-500">{hint}</p>}
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
    );
}
