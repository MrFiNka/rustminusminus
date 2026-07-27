import { NavLink, Outlet } from "react-router-dom";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? "bg-surface text-white" : "text-neutral-400 hover:text-white"
    }`;

export default function Layout() {
    return (
        <div className="min-h-screen bg-canvas text-neutral-200">
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
            <main className="mx-auto max-w-5xl px-6 py-8">
                <Outlet />
            </main>
        </div>
    );
};
