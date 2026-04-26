import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "mock/**",
    "scripts/**",
  ]),
  {
    // server/ must stay framework-agnostic. Banning next/* + react keeps the
    // Option C boundary honest so we can extract a standalone API by `mv`-ing
    // the folder. See PRD §9.1.
    files: ["src/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "react-dom/*"],
              message:
                "server/** is framework-agnostic. Do not import next/* or react here.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
