import { defineConfig, devices } from "@playwright/test";

/**
 * End to end, against the demo build.
 *
 * Every other test in this repo stops at a component or an HTTP call. Nothing
 * drove the client from the outside, which is how a page can render, pass every
 * unit test, and still be unusable: hipuku-web shipped a grid whose cards took
 * focus at `opacity: 0` for weeks with a green suite the whole time.
 *
 * The demo build is the subject rather than the dev build, because the demo
 * build is what is deployed. `VITE_DEMO_MODE=true` replaces the network calls
 * with the captured audit; everything above them, which is all of the UI, is
 * the code that ships.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  use: {
    baseURL: "http://localhost:4173",
    // On the first retry, so a flake costs nothing and a real failure arrives
    // with a trace to read.
    trace: "on-first-retry",
  },

  // Built, not `vite dev`: a dev server transforms modules on demand and serves
  // a different bundle from the one on the CDN.
  webServer: {
    command: "npm run build:demo && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
