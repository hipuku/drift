import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CrawlJobs } from "../queue/crawlJobs.js";
import type { CrawlResult, ElementStyle } from "../crawler/types.js";
import { RateLimiter } from "./access.js";
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

  it("refuses a non-http scheme on both routes without calling discovery or the queue", async () => {
    let discovered = false;
    let enqueued = false;
    const base = await listen({
      jobs: fakeJobs({
        async enqueue() {
          enqueued = true;
          return "job_never";
        },
      }),
      discover: async () => {
        discovered = true;
        return { rootUrl: "", host: "", pages: [] };
      },
    });

    for (const path of ["/discover", "/crawl"]) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "ftp://example.com" }),
      });
      expect(res.status).toBe(422);
    }
    expect(discovered).toBe(false);
    expect(enqueued).toBe(false);
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

describe("crawl targets on a private network", () => {
  const post = (base: string, path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  afterEach(() => {
    delete process.env.DRIFT_CRAWL_ALLOWED_HOSTS;
  });

  it.each(["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/", "127.0.0.1"])(
    "POST /crawl refuses %s without queueing it",
    async (url) => {
      let queued = false;
      const base = await listen({
        jobs: fakeJobs({
          async enqueue() {
            queued = true;
            return "job_x";
          },
        }),
      });
      const res = await post(base, "/crawl", { url });
      expect(res.status).toBe(422);
      expect((await res.json()).error).toMatch(/private or local network/);
      expect(queued).toBe(false);
    },
  );

  it("POST /crawl refuses an IPv6 literal before it reaches the address check", async () => {
    const base = await listen({ jobs: fakeJobs() });
    const res = await post(base, "/crawl", { url: "http://[::ffff:127.0.0.1]/" });
    expect(res.status).toBe(422);
  });

  it("POST /discover refuses a private address without reading it", async () => {
    let read = false;
    const base = await listen({
      jobs: fakeJobs(),
      discover: async () => {
        read = true;
        return { rootUrl: "", host: "", pages: [] };
      },
    });
    const res = await post(base, "/discover", { url: "http://192.168.1.1/" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/private or local network/);
    expect(read).toBe(false);
  });

  it("POST /crawl takes a private host the operator allowlisted", async () => {
    process.env.DRIFT_CRAWL_ALLOWED_HOSTS = "127.0.0.1";
    const base = await listen({ jobs: fakeJobs() });
    const res = await post(base, "/crawl", { url: "http://127.0.0.1:4000/" });
    expect(res.status).toBe(202);
  });
});

describe("API token", () => {
  const routes: Array<[string, string, unknown?]> = [
    ["POST", "/crawl", { url: "https://example.com" }],
    ["POST", "/discover", { url: "https://example.com" }],
    ["GET", "/crawl/job_1/result"],
    ["GET", "/crawl/job_1/audit"],
  ];
  const call = (base: string, [method, path, body]: [string, string, unknown?], auth?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(auth ? { authorization: auth } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it.each(routes)("%s %s answers 401 without the token", async (...route) => {
    const base = await listen({ jobs: fakeJobs(), token: "s3cret" });
    const res = await call(base, route);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
  });

  it.each(routes)("%s %s answers as before with the token", async (...route) => {
    const base = await listen({
      jobs: fakeJobs({
        async getResult() {
          return { status: "completed", result: fakeResult() };
        },
      }),
      token: "s3cret",
    });
    const res = await call(base, route, "Bearer s3cret");
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(400);
  });
});

describe("rate limit and queue cap", () => {
  const crawl = (base: string) =>
    fetch(`${base}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

  it("answers 429 with Retry-After once a caller passes the limit", async () => {
    const base = await listen({ jobs: fakeJobs(), rateLimiter: new RateLimiter(2, 60_000) });
    expect((await crawl(base)).status).toBe(202);
    expect((await crawl(base)).status).toBe(202);
    const res = await crawl(base);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("counts /discover against the same limit", async () => {
    const base = await listen({ jobs: fakeJobs(), rateLimiter: new RateLimiter(1, 60_000) });
    expect((await crawl(base)).status).toBe(202);
    const res = await fetch(`${base}/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(429);
  });

  it("answers 429 without queueing when the queue is full", async () => {
    let queued = false;
    const base = await listen({
      jobs: fakeJobs({
        async pending() {
          return 3;
        },
        async enqueue() {
          queued = true;
          return "job_x";
        },
      }),
      maxQueued: 3,
    });
    const res = await crawl(base);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await res.json()).error).toMatch(/queue is full/);
    expect(queued).toBe(false);
  });
});
