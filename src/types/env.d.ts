declare module "bun" {
    interface Env {
        TOKEN: string;
        // Env vars are always strings at runtime - typing this as `number` made every consumer
        // (e.g. scripts/dev.ts spreading process.env) a type error for a value that is never a number.
        PORT: string;
        HOST: string;
        OAUTH_SECRET: string;
        PROTOCOL: string;
        MONGODB_URI: string;
        STEAM_API_KEY: string;
    }
}