import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CrawlJobs } from "../queue/crawlJobs.js";
import type { CrawlResult, ElementStyle } from "../crawler/types.js";
import { createApp, type AppDeps } from "./app.js";

// --- fakes ----------------------------------------------------------------

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

/** A crawl result with two text elements on one page, for the audit route. */
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
    const base = await listen({ jobs });

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
    const base = await listen({ jobs });

    await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", maxPages: 9999 }),
    });

    expect(received).toEqual({ url: "https://example.com", maxPages: 10 }); // MAX_CRAWL_PAGES
  });

  it("POST /crawl rejects a missing url", async () => {
    const base = await listen({ jobs: fakeJobs() });
    const res = await fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("GET /crawl/:jobId/audit returns the full inventory for a finished crawl", async () => {
    const jobs = fakeJobs({
      async getResult() {
        return { status: "completed", result: fakeResult() };
      },
    });
    const base = await listen({ jobs });

    const res = await fetch(`${base}/crawl/job_1/audit`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.distinctColours).toBeGreaterThanOrEqual(2);
    expect(body.summary.fontFamilies).toBe(1);
    expect(Array.isArray(body.colourFamilies)).toBe(true);
    expect(Array.isArray(body.typography.roles)).toBe(true);
  });
});
