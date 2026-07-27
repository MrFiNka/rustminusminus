import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
    {
        ignores: ["node_modules/**", "public/js/**", "public/css/**", "items.json"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/client/**/*.{ts,tsx}"],
        ...react.configs.flat.recommended,
        plugins: {
            react,
            "react-hooks": reactHooks,
        },
        rules: {
            ...react.configs.flat.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            // flags every Date.now()/new Date() call made during render (e.g. relative-time
            // formatting) - enforcing this would mean restructuring render logic app-wide,
            // out of scope here
            "react-hooks/purity": "off",
        },
        settings: {
            react: { version: "19" },
        },
    },
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "off",
            "no-empty": ["error", { allowEmptyCatch: true }],
            // the existing codebase uses `let` pervasively; converting it all to `const` is a
            // separate mechanical pass, not part of this cleanup - relax this so lint is usable now
            "prefer-const": "off",
        },
    },
);
