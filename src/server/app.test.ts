import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AuditService, CheckpointNotFoundError } from "../agent/auditService.js";
import type { RedisLike } from "../agent/checkpoint.js";
import type { AgentClient } from "../agent/config.js";
import type { CrawlJobs } from "../queue/crawlJobs.js";
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

async function listen(deps: AppDeps): Promise<string> {
  const app = createApp(deps);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

// --- tests ----------------------------------------------------------------

describe("HTTP API", () => {
  it("POST /crawl enqueues and returns a job id", async () => {
    let received: unknown;
    const jobs = fakeJobs({
      async enqueue(data) {
        received = data;
        return "job_abc";
      },
    });
    const base = await listen({ jobs, audit: fakeAudit({}), redis: noRedis });

    const res = await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", maxPages: 9 }),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job_abc" });
    expect(received).toEqual({ url: "https://example.com", maxPages: 5 }); // clamped
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
