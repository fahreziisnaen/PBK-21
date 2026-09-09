import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git-ignored working directories that are never source — a vendored
    // portable PostgreSQL install lives inside the repo and otherwise
    // makes the flat config walk a huge third-party bundle.
    ".postgres/**",
    ".pgdata/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
