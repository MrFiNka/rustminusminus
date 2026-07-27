export const SectionCard = ({
    icon,
    title,
    count,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    count?: number;
    children: React.ReactNode;
}) => (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="text-neutral-500">{icon}</span>
            <h2 className="text-sm font-medium text-white">{title}</h2>
            {count !== undefined && (
                <span className="ml-auto rounded-full bg-surface-hover px-2 py-0.5 text-xs text-neutral-500">{count}</span>
            )}
        </div>
        {children}
    </section>
);
