import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * drift is two programs in one repo: a Node service under `src/` and a browser
 * client under `client/src/`. They need different globals, and the crawler needs
 * both. Its extraction functions are authored against the DOM but shipped to
 * the page by Playwright from Node.
 */
/** Each scope, and the layers it may not import. See the boundaries block below. */
const LAYERS = [
  {
    files: ["client/src/components/**/*.{ts,tsx}"],
    forbidden: ["screens", "flow", "shell", "dev", "lib", "demo", "hooks"],
    message:
      "Components are the lowest layer and take data as props: no screen or above, and no lib, demo or hooks.",
  },
  {
    files: ["client/src/{lib,demo,hooks}/**/*.{ts,tsx}"],
    forbidden: ["components", "screens", "flow", "shell", "dev"],
    message: "lib, demo and hooks hold no interface, so they cannot import one.",
  },
  {
    files: ["client/src/screens/**/*.{ts,tsx}"],
    forbidden: ["flow", "shell", "dev"],
    message: "Screens sit below the flow, the shell and the dev harness.",
  },
  {
    files: ["src/**/*.ts"],
    forbidden: ["client"],
    message: "The service never imports the client; shared shapes live in openapi.yaml.",
  },
];

export default defineConfig([
  globalIgnores(["dist", "client/dist", "node_modules", "appendonlydir", "**/*.rdb"]),

  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // The service.
    files: ["src/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  {
    // In-page extraction: serialised by page.evaluate and run in the browser,
    // so it is authored against the DOM even though it lives in the Node half.
    files: ["src/crawler/extract.ts", "src/crawler/discover.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    files: ["client/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      // Errors, not warnings. A warning does not fail CI, so a count of them
      // only ever grows, and both of the two this repo carried turned out to
      // be real: each was a type declaring a field optional that is always
      // present, so `?? []` built a new array every render and defeated the
      // memo below it. A dependency warning is worth reading, which means it is
      // worth being unable to ignore. Suppress a specific one at its own site,
      // with a comment saying why, as AuditFlow.tsx does.
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Import boundaries, the client's layers as a failing build rather than a
  // convention. Lowest first: components are the interface's primitives; lib,
  // demo and hooks are data and behaviour with no interface; screens compose
  // both; flow, shell and dev sit above the screens. A layer imports its own
  // or a lower one, never a higher one. Tests are exempt: some compare the
  // client with the service on purpose.
  ...LAYERS.map(({ files, forbidden, message }) => ({
    files,
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      // Static imports and re-exports, including a path that ends at the
      // layer's folder (`../../demo` resolves to `demo/index.ts`).
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: forbidden.flatMap((d) => [`**/${d}`, `**/${d}/**`]), message }] },
      ],
      // Dynamic import() with a literal path, which no-restricted-imports
      // does not see.
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/(^|\\/)(${forbidden.join("|")})(\\/|$)/]`,
          message,
        },
      ],
    },
  })),

  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.vitest } },
  },

  {
    files: ["**/*.config.{ts,js,mjs}"],
    languageOptions: { globals: globals.node },
  },
]);
