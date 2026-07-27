declare module "bun" {
    interface Env {
        TOKEN: string;
        // Env vars are always strings at runtime - typing this as `number` made every consumer
        // (e.g. scripts/dev.ts spreading process.env) a type error for a value that is never a number.
        PORT: string;
        /** Public origin of the dashboard - every URL the bot hands out is built from it, so behind
         *  a proxy this is the external address, not localhost:PORT. Replaced PROTOCOL/HOST/PORT. */
        BASE_URL: string;
        OAUTH_SECRET: string;
        MONGODB_URI: string;
        STEAM_API_KEY: string;
        NODE_ENV: string;
        /** Optional - Discord user id granted bot-owner-only surfaces. */
        OWNER_DISCORD_ID: string;
    }
}