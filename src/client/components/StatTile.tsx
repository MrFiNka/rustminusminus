export const statIconClass = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent";

export const StatTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div className="flex min-w-32 flex-1 items-center gap-3 px-4 py-3.5">
        {icon}
        <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
            <div className="truncate text-base font-semibold text-white">{value}</div>
        </div>
    </div>
);
