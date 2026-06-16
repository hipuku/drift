/**
 * HTTP API.
 *
 * Thin Express surface over the queue and the audit service. Dependencies are
 * injected so the app is testable without Redis, BullMQ, or a live model.
 *
 *   POST /crawl                     enqueue a crawl, return { jobId }
 *   GET  /crawl/:jobId/result       fetch crawl status / result
 *   POST /audit/:jobId              run the audit (may pause for review)
 *   GET  /audit/:jobId/checkpoint   the pending review, if the audit paused
 *   POST /audit/:jobId/resume       resume with human judgments
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  AuditService,
  CheckpointNotFoundError,
  CrawlResultNotFoundError,
} from "../agent/auditService.js";
import { loadCheckpoint, type RedisLike } from "../agent/checkpoint.js";
import { pendingReview } from "../agent/runner.js";
import type { Judgment } from "../agent/types.js";
import type { DiscoverResult } from "../crawler/types.js";
import type { CrawlJobs } from "../queue/crawlJobs.js";

export interface AppDeps {
  jobs: CrawlJobs;
  audit: AuditService;
  redis: RedisLike;
  discover: (url: string) => Promise<DiscoverResult>;
}

function clampPages(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.floor(n)));
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
      const jobId = await deps.jobs.enqueue({ url, maxPages: clampPages(req.body?.maxPages) });
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
        res.status(422).json({ error: err instanceof Error ? err.message : "discovery failed" });
      }
    }),
  );

  app.get(
    "/crawl/:jobId/result",
    wrap(async (req, res) => {
      const { status, result } = await deps.jobs.getResult(String(req.params.jobId));
      if (status === "not_found") {
        res.status(404).json({ error: "job not found" });
        return;
      }
      res.json({ status, result: result ?? null });
    }),
  );

  app.post(
    "/audit/:jobId",
    wrap(async (req, res) => {
      const outcome = await deps.audit.start(String(req.params.jobId));
      res.json(outcome);
    }),
  );

  app.get(
    "/audit/:jobId/checkpoint",
    wrap(async (req, res) => {
      const checkpoint = await loadCheckpoint(deps.redis, String(req.params.jobId));
      if (!checkpoint) {
        res.status(404).json({ error: "no pending checkpoint" });
        return;
      }
      res.json(pendingReview(checkpoint));
    }),
  );

  app.post(
    "/audit/:jobId/resume",
    wrap(async (req, res) => {
      const judgments = req.body?.judgments;
      if (!Array.isArray(judgments)) {
        res.status(400).json({ error: "judgments array is required" });
        return;
      }
      const outcome = await deps.audit.resume(String(req.params.jobId), judgments as Judgment[]);
      res.json(outcome);
    }),
  );

  // Map known domain errors to status codes.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CrawlResultNotFoundError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof CheckpointNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "internal error";
    res.status(500).json({ error: message });
  });

  return app;
}
