import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AuditService, CheckpointNotFoundError } from "../agent/auditService.js";
import type { RedisLike } from "../agent/checkpoint.js";
import type { AgentClient } from "../agent/config.js";
import type { CrawlJobs } from "../queue/crawlJobs.js";
import type { CrawlResult, ElementStyle } from "../crawler/types.js";
import { createApp, type AppDeps } from "./app.js";

// --- fakes ----------------------------------------------------------------

const noRedis: RedisLike = {
  async set() {
    return "OK";
  },
  async get() {
    return null;
  },
  async del() {
    return 1;
  },
};

function fakeJobs(overrides: Partial<CrawlJobs> = {}): CrawlJobs {
  return {
    async enqueue() {
      return "job_123";
    },
    async getResult() {
      return { status: "completed", result: undefined };
    },
    ...overrides,
  };
}

/** A crawl result with two text elements on one page, for the typography route. */
function fakeResult(): CrawlResult {
  const style = (over: Partial<ElementStyle>): ElementStyle => ({
    color: null,
    backgroundColor: null,
    effectiveBackgroundColor: null,
    borderColor: [],
    fontFamily: null,
    fontSize: null,
    fontWeight: null,
    lineHeight: null,
    letterSpacing: 0,
    borderRadius: [],
    boxShadow: null,
    padding: [0, 0, 0, 0],
    ...over,
  });
  const elements = [
    {
      tag: "p",
      hasText: true,
      styles: style({
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        color: "#111111",
        backgroundColor: "#ffffff",
        effectiveBackgroundColor: "#ffffff",
      }),
    },
    {
      tag: "h1",
      hasText: true,
      styles: style({
        fontFamily: "Inter",
        fontSize: 32,
        fontWeight: 700,
        color: "#111111",
        backgroundColor: "#ffffff",
        effectiveBackgroundColor: "#ffffff",
      }),
    },
  ];
  return {
    rootUrl: "https://example.com",
    crawledAt: "2026-06-17T00:00:00.000Z",
    pages: [{ url: "https://example.com", title: "Home", elementCount: 2, elements }],
  };
}

/** An AuditService whose start/resume are stubbed. */
function fakeAudit(overrides: Partial<AuditService>): AuditService {
  const base = new AuditService({} as AgentClient, noRedis, {
    async getCrawlResult() {
      return null;
    },
  });
  return Object.assign(base, overrides);
}

let server: Server;

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function listen(
  deps: Omit<AppDeps, "discover"> & Partial<Pick<AppDeps, "discover">>,
): Promise<string> {
  const app = createApp({
    discover: async () => ({ rootUrl: "", host: "", pages: [] }),
    ...deps,
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

// --- tests ----------------------------------------------------------------

describe("HTTP API", () => {
  it("POST /crawl enqueues the selected pages and returns a job id", async () => {
    let received: unknown;
    const jobs = fakeJobs({
      async enqueue(data) {
        received = data;
        return "job_abc";
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    const pages = ["https://example.com/", "https://example.com/about/"];
    const res = await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", pages }),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job_abc" });
    // maxPages derives from the selection length; the pages come through.
    expect(received).toEqual({ url: "https://example.com", maxPages: 2, pages });
  });

  it("POST /crawl clamps maxPages to the ceiling when no pages are given", async () => {
    let received: unknown;
    const jobs = fakeJobs({
      async enqueue(data) {
        received = data;
        return "job_x";
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", maxPages: 9999 }),
    });

    expect(received).toEqual({ url: "https://example.com", maxPages: 40 }); // MAX_CRAWL_PAGES
  });

  it("POST /crawl rejects a missing url", async () => {
    const base = await listen({ jobs: fakeJobs(), audit: fakeAudit({}), redis: noRedis });
    const res = await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /audit/:jobId/resume forwards judgments and returns the outcome", async () => {
    let got: unknown;
    const audit = fakeAudit({
      async resume(jobId, judgments) {
        got = { jobId, judgments };
        return { status: "report", report: { healthScore: 100, summary: "", findings: [], consolidationOpportunities: [] }, findings: {} };
      },
    });
    const base = await listen({ jobs: fakeJobs(), audit, redis: noRedis });

    const res = await fetch(`${base}/audit/job_9/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ judgments: [{ id: "x", decision: "consolidation_target" }] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("report");
    expect(got).toEqual({
      jobId: "job_9",
      judgments: [{ id: "x", decision: "consolidation_target" }],
    });
  });

  it("GET /crawl/:jobId/typography returns the inventory for a finished crawl", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "completed", result: fakeResult() };
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    const res = await fetch(`${base}/crawl/job_1/typography`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.baseSizePx).toBe(16);
    expect(body.primaryFamily).toBe("Inter");
    expect(body.sizes.map((s: { px: number }) => s.px)).toEqual([16, 32]);
  });

  it("GET /crawl/:jobId/typography is 409 before the crawl finishes", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "active", result: undefined };
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });
    const res = await fetch(`${base}/crawl/job_1/typography`);
    expect(res.status).toBe(409);
  });

  it("GET /crawl/:jobId/typography is 404 for an unknown job", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "not_found", result: undefined };
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });
    const res = await fetch(`${base}/crawl/nope/typography`);
    expect(res.status).toBe(404);
  });

  it("GET /crawl/:jobId/colours returns clusters for a finished crawl", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "completed", result: fakeResult() };
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    const res = await fetch(`${base}/crawl/job_1/colours`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clusterCount).toBeGreaterThan(0);
    expect(body.distinctColours).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.clusters)).toBe(true);
  });

  it("GET /crawl/:jobId/audit returns the full inventory for a finished crawl", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "completed", result: fakeResult() };
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    const res = await fetch(`${base}/crawl/job_1/audit`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.distinctColours).toBeGreaterThanOrEqual(2);
    expect(body.summary.fontFamilies).toBe(1);
    expect(Array.isArray(body.colourFamilies)).toBe(true);
    expect(Array.isArray(body.typography.roles)).toBe(true);
  });

  it("maps CheckpointNotFoundError to 404", async () => {
    const audit = fakeAudit({
      async resume(jobId) {
        throw new CheckpointNotFoundError(jobId);
      },
    });
    const base = await listen({ jobs: fakeJobs(), audit, redis: noRedis });

    const res = await fetch(`${base}/audit/missing/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ judgments: [] }),
    });
    expect(res.status).toBe(404);
  });
});
