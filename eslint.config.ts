import { generateBaseConfigs } from "@kachkaev/eslint-config-base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

  {
    ignores: [".husky/**", "dist/**"],
  },

  {
    // Rules added in eslint-plugin-unicorn v65–v74 (via @kachkaev/eslint-config-base v2) that this
    // codebase does not adopt yet; reviewed collectively in https://github.com/kachkaev/repo-dive/issues/212.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "unicorn/consistent-boolean-name": "off", // Wants `is`/`has` prefixes; the autofix produces awkward names and some flags are part of function signatures.
      "unicorn/max-nested-calls": "off", // Effect programs and CLI wiring nest pipe/gen calls deeply by nature.
      "unicorn/no-break-in-nested-loop": "off", // `continue` in a nested loop reads fine here; extracting functions for it adds noise.
      "unicorn/no-unreadable-for-of-expression": "off", // Iterating over an inline filtered array is idiomatic here.
      "unicorn/single-line-block-comment-style": "off", // Single-line `/** … */` doc comments are the norm here; rewriting them into three-line blocks is churn without benefit.
    },
  },

  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "import/no-extraneous-dependencies": "off", // The CLI is bundled by Vite with only Node.js builtins external, so its packages live in devDependencies by design. // Effect-heavy APIs infer large Effect<Success, Error, Requirements> signatures; repeating them adds noise.
      "func-style": "off", // Effect code is typically composed from const-bound helpers that are easy to pass around and pipe.
      "unicorn/no-array-callback-reference": "off", // False positive for Effect.forEach(iterable, effect), which is not Array#forEach(callback, thisArg).
      "unicorn/no-array-method-this-argument": "off", // False positive for Effect.forEach(iterable, effect), which reuses array method names with different argument positions.
    },
  },
]);
