/**
 * Demo mode.
 *
 * The crawler is Playwright behind a Redis queue. Hosting it publicly costs
 * money and would let anyone point it at any site, so the public build replays
 * an audit captured from a real crawl. The aggregation, verdicts and export run
 * on that capture; only the API calls are stubbed. The configure screen says
 * this is a demo.
 *
 * Enabled at build time with VITE_DEMO_MODE=true; the dev build talks to the
 * real backend as usual.
 */

import type { CrawlStatus, SiteAudit } from "../lib/api.js";
import auditFixture from "./audit.json";
import discoveryFixture from "./discovery.json";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/** The site the bundled audit was captured from. */
export const DEMO_SITE = discoveryFixture.host;

/**
 * When the capture was taken, read off the artefact `npm run capture` wrote.
 * A hand-written date here would go stale silently on the next recapture.
 */
export const DEMO_CAPTURED = new Date(`${auditFixture.capturedAt}T00:00:00Z`).toLocaleDateString(
  "en-GB",
  { month: "long", year: "numeric", timeZone: "UTC" },
);

export interface DiscoveryResponse {
  rootUrl: string;
  host: string;
  via: string;
  pages: { path: string; url: string; title: string }[];
}

/**
 * How long the replayed crawl "takes". Long enough that the progress screen is
 * seen rather than flashing past, short enough that nobody waits.
 */
const REPLAY_MS = 2400;

let startedAt = 0;

export function demoDiscover(): DiscoveryResponse {
  return discoveryFixture as DiscoveryResponse;
}

export function demoStartCrawl(): { jobId: string } {
  startedAt = Date.now();
  return { jobId: "demo" };
}

export function demoCrawlStatus(): CrawlStatus {
  const done = Date.now() - startedAt >= REPLAY_MS;
  if (!done) return { status: "active", result: null };
  return {
    status: "completed",
    result: {
      rootUrl: discoveryFixture.rootUrl,
      crawledAt: new Date().toISOString(),
      pages: discoveryFixture.pages.map((p) => ({
        url: p.url,
        title: p.path,
        elementCount: 0,
      })),
    },
  };
}

export function demoAudit(): SiteAudit {
  return auditFixture as unknown as SiteAudit;
}
