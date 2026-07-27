import type { ReactNode } from "react";

export const Table = ({ children }: { children: ReactNode }) => (
    <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
);

export const Thead = ({ children }: { children: ReactNode }) => (
    <thead className="bg-surface text-xs uppercase tracking-wide text-neutral-400">
        <tr>{children}</tr>
    </thead>
);

export const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>
);

export const Tbody = ({ children }: { children: ReactNode }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
);

export const Tr = ({
    children,
    onClick,
    className = "",
}: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
}) => (
    <tr
        onClick={onClick}
        className={`transition-colors ${onClick ? "cursor-pointer hover:bg-surface-hover" : ""} ${className}`}
    >
        {children}
    </tr>
);

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <td className={`px-4 py-3 ${className}`}>{children}</td>
);

export const EmptyState = ({ children }: { children: ReactNode }) => (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-neutral-500">
        {children}
    </div>
);
