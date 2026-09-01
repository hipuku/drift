import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  discoverPages,
  getAudit,
  getCrawlStatus,
  progressSocketUrl,
  startCrawl,
} from "./api";

/**
 * These run with DEMO_MODE off (VITE_DEMO_MODE is unset under vitest), so every
 * call takes the real network path. That is the path worth pinning: the demo
 * branch returns a fixture and cannot regress against the server contract.
 */

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const err = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

/** A response whose body is not JSON at all: a proxy error page, say. */
const notJson = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("error surfacing", () => {
  it("throws the server's friendly error string", async () => {
    fetchMock.mockResolvedValue(err(400, { error: "That host did not resolve." }));
    await expect(discoverPages("http://nope.example")).rejects.toThrow(
      "That host did not resolve.",
    );
  });

  it("falls back to the status code when the body carries no error", async () => {
    fetchMock.mockResolvedValue(err(503, {}));
    await expect(getAudit("job-1")).rejects.toThrow("Request failed (503)");
  });

  it("falls back rather than throwing when the body is not JSON", async () => {
    // A proxy or gateway returning HTML must not surface as a JSON parse error;
    // the user needs the status, not a stack trace about a `<`.
    fetchMock.mockResolvedValue(notJson(502));
    await expect(getAudit("job-1")).rejects.toThrow("Request failed (502)");
  });
});

describe("startCrawl", () => {
  it("posts the selection and derives maxPages from it", async () => {
    fetchMock.mockResolvedValue(ok({ jobId: "abc" }));
    const pages = ["https://x.test/", "https://x.test/about"];

    await expect(startCrawl("https://x.test", pages)).resolves.toEqual({ jobId: "abc" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/crawl");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    // maxPages must match the selection, not a default: the server caps the
    // crawl with it, and a stale number would crawl the wrong number of pages.
    expect(JSON.parse(init.body)).toEqual({
      url: "https://x.test",
      pages,
      maxPages: 2,
    });
  });
});

describe("discoverPages", () => {
  it("trims the url before sending it", async () => {
    fetchMock.mockResolvedValue(ok({ host: "x.test", pages: [] }));

    await discoverPages("  https://x.test  ");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/discover");
    expect(JSON.parse(init.body)).toEqual({ url: "https://x.test" });
  });
});

describe("read endpoints", () => {
  const cases: [string, (id: string) => Promise<unknown>, string][] = [
    ["getCrawlStatus", getCrawlStatus, "result"],
    ["getAudit", getAudit, "audit"],
  ];

  it.each(cases)("%s requests the right path", async (_name, call, segment) => {
    fetchMock.mockResolvedValue(ok({}));
    await call("job-1");
    expect(fetchMock).toHaveBeenCalledWith(`/api/crawl/job-1/${segment}`);
  });

  it.each(cases)("%s encodes the job id", async (_name, call, segment) => {
    // BullMQ ids are opaque. A `/` or `?` in one would silently address a
    // different route, so the id is encoded rather than interpolated raw.
    fetchMock.mockResolvedValue(ok({}));
    await call("a/b?c");
    expect(fetchMock).toHaveBeenCalledWith(`/api/crawl/a%2Fb%3Fc/${segment}`);
  });

  it("returns the parsed body", async () => {
    const status = { status: "completed", result: null };
    fetchMock.mockResolvedValue(ok(status));
    await expect(getCrawlStatus("job-1")).resolves.toEqual(status);
  });
});

describe("progressSocketUrl", () => {
  const setLocation = (protocol: string, host: string) => {
    Object.defineProperty(window, "location", {
      value: { protocol, host },
      writable: true,
      configurable: true,
    });
  };

  it("uses ws over http", () => {
    setLocation("http:", "localhost:5173");
    expect(progressSocketUrl()).toBe("ws://localhost:5173/ws");
  });

  it("uses wss over https", () => {
    // Getting this wrong is a mixed-content failure that only shows in
    // production, where the page is served over TLS and the socket is not.
    setLocation("https:", "drift.hipuku.dev");
    expect(progressSocketUrl()).toBe("wss://drift.hipuku.dev/ws");
  });
});
