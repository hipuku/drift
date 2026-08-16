/**
 * Demo mode.
 *
 * Drift's engine is a Playwright crawler behind a Redis-backed queue, which is
 * not something to leave running on a public URL: it costs money to host, and
 * an open crawler pointed at arbitrary sites by strangers is a liability.
 *
 * So the deployed build ships a real audit captured from a real crawl and
 * replays it. Everything downstream of the crawl — the aggregation, the
 * verdicts, the export — is the genuine output, because it *is* the genuine
 * output; only the network round-trip is stubbed. The UI says so rather than
 * pretending to crawl on demand.
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

/** When the capture was taken, for the banner. */
export const DEMO_CAPTURED = "August 2026";

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
