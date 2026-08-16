/**
 * HTTP API.
 *
 * Thin, deterministic Express surface over the crawl queue and the audit
 * builders. Dependencies are injected so the app is testable without Redis or
 * BullMQ. No model: every endpoint is computed.
 *
 *   POST /crawl                     enqueue a crawl, return { jobId }
 *   GET  /crawl/:jobId/result       fetch crawl status / result
 *   GET  /crawl/:jobId/typography   deterministic typography inventory
 *   GET  /crawl/:jobId/colours      deterministic colour clusters
 *   GET  /crawl/:jobId/audit        the full deterministic audit
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { collectAudit } from "../analysis/audit.js";
import { assertDeliverable } from "../queue/webhook.js";
import { clusterColours } from "../analysis/colours.js";
import { collectTypography } from "../analysis/typography.js";
import { MAX_CRAWL_PAGES } from "../crawler/crawl.js";
import type { DiscoverResult } from "../crawler/types.js";
import type { CrawlJobs } from "../queue/crawlJobs.js";

export interface AppDeps {
  jobs: CrawlJobs;
  discover: (url: string) => Promise<DiscoverResult>;
}

// Turn raw crawler/Playwright failures into a calm, user-facing message —
// never leak "page.goto: net::ERR_… Call log:" to the client.
function friendlyDiscoverError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i.test(m))
    return "We couldn’t find that site — check the URL for typos.";
  if (/timeout|ERR_TIMED_OUT|timed out/i.test(m))
    return "That site took too long to respond. Try again in a moment.";
  if (/ERR_CONNECTION|ECONNREFUSED|ECONNRESET/i.test(m))
    return "We couldn’t connect to that site.";
  if (/ERR_CERT|ERR_SSL|certificate/i.test(m))
    return "That site has a security-certificate problem we couldn’t get past.";
  if (/Invalid or unsupported URL/i.test(m))
    return "That doesn’t look like a valid web address.";
  return "We couldn’t read that site. Check the URL and try again.";
}

function clampPages(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_CRAWL_PAGES, Math.floor(n)));
}

/** Same-origin-agnostic list of page URLs to crawl, if the client sent one. */
function readPages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pages = value.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return pages.length > 0 ? pages.slice(0, MAX_CRAWL_PAGES) : undefined;
}

// Forward async handler rejections to Express's error middleware.
function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post(
    "/crawl",
    wrap(async (req, res) => {
      const url = req.body?.url;
      if (typeof url !== "string" || url.trim() === "") {
        res.status(400).json({ error: "url is required" });
        return;
      }
      // Reject an unusable URL here rather than queueing a job that can only
      // fail — /discover already validates up front, and the two should agree.
      try {
        const parsed = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
        if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) {
          throw new Error("unsupported");
        }
      } catch {
        res.status(422).json({ error: "That doesn\u2019t look like a valid web address." });
        return;
      }
      // Optional webhook target. Validated here — while the caller is still on
      // the line to be told why — rather than discovered at delivery time.
      const callbackUrl = req.body?.callbackUrl;
      if (callbackUrl !== undefined) {
        if (typeof callbackUrl !== "string") {
          res.status(422).json({ error: "callbackUrl must be a string." });
          return;
        }
        try {
          await assertDeliverable(callbackUrl);
        } catch (err) {
          res.status(422).json({ error: err instanceof Error ? err.message : "Invalid callbackUrl." });
          return;
        }
      }
      const pages = readPages(req.body?.pages);
      const maxPages = clampPages(pages?.length ?? req.body?.maxPages);
      const jobId = await deps.jobs.enqueue({ url, maxPages, pages, callbackUrl });
      res.status(202).json({ jobId });
    }),
  );

  app.post(
    "/discover",
    wrap(async (req, res) => {
      const url = req.body?.url;
      if (typeof url !== "string" || url.trim() === "") {
        res.status(400).json({ error: "url is required" });
        return;
      }
      try {
        res.json(await deps.discover(url));
      } catch (err) {
        res.status(422).json({ error: friendlyDiscoverError(err) });
      }
    }),
  );

  app.get(
    "/crawl/:jobId/result",
    wrap(async (req, res) => {
      const { status, result, error } = await deps.jobs.getResult(String(req.params.jobId));
      if (status === "not_found") {
        res.status(404).json({ error: "job not found" });
        return;
      }
      res.json({ status, result: result ?? null, ...(error ? { error } : {}) });
    }),
  );

  // The deterministic typography inventory that seeds the Layer-2 type-scale
  // proposals. Derived from the completed crawl.
  app.get(
    "/crawl/:jobId/typography",
    wrap(async (req, res) => {
      const { status, result } = await deps.jobs.getResult(String(req.params.jobId));
      if (status === "not_found") {
        res.status(404).json({ error: "job not found" });
        return;
      }
      if (!result) {
        res.status(409).json({ error: "the crawl has not finished" });
        return;
      }
      res.json(collectTypography(result));
    }),
  );

  // The deterministic colour inventory: perceptual clusters with usage. Seeds
  // the Layer-2 consolidation proposal.
  app.get(
    "/crawl/:jobId/colours",
    wrap(async (req, res) => {
      const { status, result } = await deps.jobs.getResult(String(req.params.jobId));
      if (status === "not_found") {
        res.status(404).json({ error: "job not found" });
        return;
      }
      if (!result) {
        res.status(409).json({ error: "the crawl has not finished" });
        return;
      }
      const clusters = clusterColours(result);
      res.json({
        clusters,
        clusterCount: clusters.length,
        distinctColours: clusters.reduce((n, c) => n + c.size, 0),
      });
    }),
  );

  // The full deterministic audit — every colour/size/spacing/radius/shadow in
  // use, grouped and summarised. The diagnosis shown before any proposal.
  app.get(
    "/crawl/:jobId/audit",
    wrap(async (req, res) => {
      const { status, result } = await deps.jobs.getResult(String(req.params.jobId));
      if (status === "not_found") {
        res.status(404).json({ error: "job not found" });
        return;
      }
      if (!result) {
        res.status(409).json({ error: "the crawl has not finished" });
        return;
      }
      res.json(collectAudit(result));
    }),
  );

  // Any uncaught handler rejection becomes a calm 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "internal error";
    res.status(500).json({ error: message });
  });

  return app;
}
