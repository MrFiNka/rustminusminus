import { Toggle } from "./Toggle";

interface ModuleListItem {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
}

export function ModuleToggleList({
    modules,
    emptyText,
    onToggle,
}: {
    modules: ModuleListItem[];
    emptyText: string;
    onToggle: (moduleId: string, enabled: boolean) => void;
}) {
    if (modules.length === 0) {
        return <p className="text-sm text-neutral-500">{emptyText}</p>;
    }
    return (
        <div className="flex flex-col gap-3">
            {modules.map((mod) => (
                <div key={mod.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <span className="font-medium text-white">{mod.name}</span>
                            <p className="mt-1 text-sm text-neutral-400">{mod.description}</p>
                        </div>
                        <Toggle checked={mod.enabled} onChange={(checked) => onToggle(mod.id, checked)} />
                    </div>
                </div>
            ))}
        </div>
    );
}
