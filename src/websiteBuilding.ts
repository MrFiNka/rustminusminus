import fs from "fs/promises";
import { watch } from "fs";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { WebServer } from "./classes/WebServer";

const CLIENT_ENTRY = "src/client/index.tsx";
const JS_OUT_DIR = "public/js";
const CSS_ENTRY = "src/client/css/tailwind.css";
const CSS_OUT = "public/css/tailwind.css";
const WATCH_DIR = "./src/client";

const BOOT_ID = crypto.randomUUID().slice(0, 8);
let buildCounter = 0;

async function buildJs() {
    const result = await Bun.build({
        entrypoints: [CLIENT_ENTRY],
        outdir: JS_OUT_DIR,
        splitting: true,
        minify: Bun.env.NODE_ENV != "development",
        target: "browser",
        format: "esm",
        define: {
            "process.env.NODE_ENV": JSON.stringify(Bun.env.NODE_ENV || "production"),
        },
    });
    if (!result.success) {
        throw new Error("JS build failed:\n" + result.logs.join("\n"));
    }
}

async function buildCss() {
    await fs.mkdir("public/css", { recursive: true });
    const input = await fs.readFile(CSS_ENTRY, "utf-8");
    const result = await postcss([tailwindcss()]).process(input, { from: CSS_ENTRY, to: CSS_OUT });
    await fs.writeFile(CSS_OUT, result.css);
}

let buildPromise: Promise<void> | null = null;

/**
 * Rebuilds JS+CSS together so they can never drift out of sync (the previous version ran two
 * independent watchers for outputs that had to stay in sync - one silently died while the other
 * kept working, leaving compiled CSS hours stale relative to the JS bundle and page markup).
 * Memoized so concurrent callers (e.g. concurrent SSR requests during a rebuild) share one
 * in-flight build instead of triggering duplicate ones.
 */
export function ensureClientBuilt(): Promise<void> {
    if (!buildPromise) {
        buildPromise = (async () => {
            console.log("Building website ...");
            await Promise.all([buildJs(), buildCss()]);
            buildCounter++;
        })().catch(error => {
            buildPromise = null;
            throw error;
        });
    }
    return buildPromise;
}

/**
 * Cache-busting query value for the served JS/CSS URLs. In development this is a fresh value on
 * every call regardless of whether a rebuild actually happened, so the browser can never serve a
 * stale cached bundle while iterating. In production it only changes on an actual successful
 * rebuild, so assets stay cacheable - seeded with a random boot id (not just the counter) so a
 * fresh deploy's first build doesn't reuse the same "?v=1" URL as the previous deployment despite
 * shipping different code (which would collide with anything that cached the old response).
 */
export function getAssetVersion(): string {
    return Bun.env.NODE_ENV == "development" ? String(Date.now()) : `${BOOT_ID}-${buildCounter}`;
}

let watchStarted = false;

export default async function websiteBuilding() {
    await ensureClientBuilt();
    if (Bun.env.NODE_ENV == "development" && !watchStarted) {
        watchStarted = true;
        let debounce: ReturnType<typeof setTimeout> | null = null;
        watch(WATCH_DIR, { recursive: true }, () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                buildPromise = null;
                WebServer.websockets.forEach(ws => ws.send("reload"));
            }, 150);
        });
    }
}
