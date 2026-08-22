import { defineConfig } from "vitest/config";

/**
 * The service suite only.
 *
 * The client is a separate package with its own vitest config: it needs jsdom
 * and a Testing Library setup file that mean nothing here. Without an explicit
 * include, vitest's default glob reaches into client/src and runs those files
 * in a Node environment, where every render fails. Scoping it keeps `npm test`
 * at the root meaning "test the service" and `npm test` in client/ meaning
 * "test the UI". CI runs both.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
