import { Link } from "react-router-dom";

export default function Home() {
    return (
        <div className="flex flex-col items-start gap-4 py-16">
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-neutral-400">
                Dashboard
            </span>
            <h1 className="text-4xl font-semibold text-white">
                Manage your Rust<span className="text-accent">+</span> servers.
            </h1>
            <p className="max-w-xl text-neutral-400">
                Configure modules, teams and credentials for every Discord server RustMinusMinus is
                running on, from one place.
            </p>
            <Link
                to="/guilds"
                className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
            >
                View your guilds
            </Link>
        </div>
    );
};
