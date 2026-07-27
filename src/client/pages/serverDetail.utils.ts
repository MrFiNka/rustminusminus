export function relativeTime(iso: string | null): string {
    if (!iso) return "Never";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export function upkeepRemaining(protectionExpiry: number | null): string {
    if (protectionExpiry == null) return "Unknown";
    const remainingMs = protectionExpiry * 1000 - Date.now();
    if (remainingMs <= 0) return "Expired";
    const hours = Math.floor(remainingMs / 3_600_000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h ${Math.floor((remainingMs % 3_600_000) / 60_000)}m`;
}

export function upkeepTier(protectionExpiry: number | null): "unknown" | "expired" | "warning" | "safe" {
    if (protectionExpiry == null) return "unknown";
    const remainingMs = protectionExpiry * 1000 - Date.now();
    if (remainingMs <= 0) return "expired";
    if (remainingMs < 6 * 3_600_000) return "warning";
    return "safe";
}

export const upkeepTierClass: Record<ReturnType<typeof upkeepTier>, string> = {
    unknown: "bg-surface-hover text-neutral-400",
    expired: "bg-red-500/10 text-red-400",
    warning: "bg-amber-500/10 text-amber-400",
    safe: "bg-emerald-500/10 text-emerald-400",
};
