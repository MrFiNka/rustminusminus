import { watch } from "fs";
import type { Subprocess } from "bun";

/**
 * Dev-only server runner. Spawns src/index.ts as a child process and restarts it whenever
 * server-side source changes, debounced so a burst of saves (or a formatter touching many files)
 * only triggers a single restart 10s after the last change settles. Client changes are ignored
 * here - they're hot-reloaded in-process by websiteBuilding.ts and never need a full restart.
 */
const DEBOUNCE_MS = 10_000;
const WATCH_DIR = "src";
const IGNORE_PREFIX = "client/"; // relative to WATCH_DIR; client HMR is handled in-process

let child: Subprocess | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function start() {
    child = Bun.spawn(["bun", "run", "src/index.ts"], {
        stdio: ["inherit", "inherit", "inherit"],
        env: { ...process.env, NODE_ENV: "development" },
    });
}

async function restart() {
    if (child) {
        child.kill();
        await child.exited;
    }
    console.log("[dev] restarting server ...");
    start();
}

start();

watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const f = filename.toString().replaceAll("\\", "/"); // Windows gives backslashes
    if (f.startsWith(IGNORE_PREFIX)) return;
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) return;

    console.log(`[dev] change in ${f} - restart in ${DEBOUNCE_MS / 1000}s`);
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(restart, DEBOUNCE_MS);
});

process.on("SIGINT", () => {
    child?.kill();
    process.exit(0);
});
