import { generateBaseConfigs } from "@kachkaev/eslint-config-base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

  {
    rules: {
      "import/no-extraneous-dependencies": [
        "warn",
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
    },
  },

  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
      curly: "off",
      "func-style": "off",
      "id-length": "off",
      "regexp/use-ignore-case": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/numeric-separators-style": "off",
      "unicorn/prefer-string-raw": "off",
    },
  },
]);
