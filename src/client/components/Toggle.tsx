export const Toggle = ({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
}) => (
    <label className="inline-flex cursor-pointer items-center gap-2 select-none">
        <span
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                checked ? "bg-accent" : "bg-surface-hover"
            }`}
        >
            <span
                className={`absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    checked ? "translate-x-4" : "translate-x-0"
                }`}
            />
        </span>
        {label && <span className="text-sm text-neutral-300">{label}</span>}
    </label>
);
