import { NavLink, Outlet } from "react-router-dom";

const REPO_URL = "https://github.com/realspinelle/rustminusminus";

/** Inlined because lucide-react v1 dropped its brand icons, GitHub's mark included. */
const GithubMark = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
);

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? "bg-surface text-white" : "text-neutral-400 hover:text-white"
    }`;

export default function Layout() {
    return (
        // Column layout so the footer sits at the bottom of short pages instead of mid-screen.
        <div className="flex min-h-screen flex-col bg-canvas text-neutral-200">
            <header className="border-b border-border">
                <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
                    <NavLink to="/" className="text-sm font-semibold tracking-wide text-white">
                        Rust<span className="text-accent">Minus</span>Minus
                    </NavLink>
                    <nav className="flex gap-1">
                        <NavLink to="/" end className={navLinkClass}>
                            Home
                        </NavLink>
                        <NavLink to="/guilds" className={navLinkClass}>
                            Guilds
                        </NavLink>
                        <NavLink to="/modules" className={navLinkClass}>
                            Modules
                        </NavLink>
                    </nav>
                </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <Outlet />
            </main>
            <footer className="border-t border-border">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4 text-sm text-neutral-500">
                    <span>
                        Rust<span className="text-accent">Minus</span>Minus
                    </span>
                    <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 transition-colors hover:text-white"
                    >
                        <GithubMark className="h-4 w-4" />
                        Source on GitHub
                    </a>
                </div>
            </footer>
        </div>
    );
};
