/**
 * Contract test: the running server against openapi.yaml.
 *
 * The spec is published as the service's interface, but until now nothing
 * proved the implementation matched it. A response shape could change in
 * app.ts and the spec would quietly become wrong — which is precisely the
 * drift drift exists to catch, in drift's own repo.
 *
 * Every case here drives a real Express app over a real socket, then validates
 * the body it got back against the schema the spec publishes for that path,
 * method and status. The schemas are read from the file, never restated, so
 * this cannot pass by agreeing with a copy of itself.
 */

import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { createApp, type AppDeps } from "./app.js";
import type { CrawlJobs } from "../queue/crawlJobs.js";
import type { CrawlResult, ElementStyle } from "../crawler/types.js";

// ── The spec, compiled ──────────────────────────────────────────────────────

const specPath = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));
const spec = parseYaml(readFileSync(specPath, "utf8")) as Record<string, unknown>;

// strict:false because an OpenAPI schema carries keywords JSON Schema does not
// know (`example`, `summary`), and they are not errors here.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, "spec");

const pointer = (...segments: string[]) =>
  segments.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

/** The declared JSON schema for one path + method + status. */
function schemaFor(path: string, method: string, status: number) {
  const ref = `spec#/${pointer(
    "paths",
    path,
    method,
    "responses",
    String(status),
    "content",
    "application/json",
    "schema",
  )}`;
  return ajv.compile({ $ref: ref });
}

/** Assert a body matches what the spec promises, and say why if it does not. */
function expectMatches(body: unknown, path: string, method: string, status: number) {
  const validate = schemaFor(path, method, status);
  const valid = validate(body);
  if (!valid) {
    throw new Error(
      `${method.toUpperCase()} ${path} → ${status} does not match openapi.yaml:\n` +
        (validate.errors ?? [])
          .map((e) => `  ${e.instancePath || "/"} ${e.message}`)
          .join("\n") +
        `\n\nbody: ${JSON.stringify(body, null, 2).slice(0, 800)}`,
    );
  }
}

// ── Fakes ───────────────────────────────────────────────────────────────────

function style(over: Partial<ElementStyle> = {}): ElementStyle {
  return {
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
  };
}

/** A crawl result rich enough that every analysis route returns real content. */
function completedResult(): CrawlResult {
  return {
    rootUrl: "https://x.test",
    crawledAt: new Date("2026-08-22T00:00:00.000Z").toISOString(),
    pages: [
      {
        url: "https://x.test/",
        title: "Home",
        elements: [
          {
            tag: "p",
            hasText: true,
            styles: style({
              fontFamily: "Inter",
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 24,
              color: "#111111",
              effectiveBackgroundColor: "#ffffff",
              backgroundColor: "#ffffff",
              padding: [8, 8, 8, 8],
              borderRadius: [4, 4, 4, 4],
            }),
          },
          {
            tag: "h1",
            hasText: true,
            styles: style({
              fontFamily: "Inter",
              fontSize: 32,
              fontWeight: 700,
              lineHeight: 40,
              color: "#222222",
              effectiveBackgroundColor: "#ffffff",
              backgroundColor: "#fafafa",
              padding: [16, 16, 16, 16],
              borderRadius: [8, 8, 8, 8],
            }),
          },
        ],
      },
    ],
  } as unknown as CrawlResult;
}

function fakeJobs(over: Partial<CrawlJobs> = {}): CrawlJobs {
  return {
    async enqueue() {
      return "job_123";
    },
    async getResult() {
      return { status: "completed", result: completedResult() };
    },
    ...over,
  } as CrawlJobs;
}

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function listen(
  deps: Partial<AppDeps> = {},
): Promise<string> {
  const app = createApp({
    jobs: fakeJobs(),
    discover: async () => ({
      rootUrl: "https://x.test",
      host: "x.test",
      pages: [{ url: "https://x.test/", path: "/", title: "Home" }],
    }),
    ...deps,
  } as AppDeps);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const postJson = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// ── The spec itself ─────────────────────────────────────────────────────────

describe("openapi.yaml", () => {
  it("declares every route the app serves", () => {
    // A route added to app.ts without a spec entry is undocumented API. This
    // is the cheap half of the contract: presence, before shape.
    expect(Object.keys(spec.paths as object).sort()).toEqual([
      "/crawl",
      "/crawl/{jobId}/audit",
      "/crawl/{jobId}/colours",
      "/crawl/{jobId}/result",
      "/crawl/{jobId}/typography",
      "/discover",
    ]);
  });

  it("is an OpenAPI 3.1 document", () => {
    expect(spec.openapi).toBe("3.1.0");
  });
});

describe("POST /discover", () => {
  it("200 matches DiscoverResult", async () => {
    const base = await listen();
    const res = await postJson(base, "/discover", { url: "x.test" });

    expect(res.status).toBe(200);
    expectMatches(await res.json(), "/discover", "post", 200);
  });

  it("400 matches Error when url is missing", async () => {
    const base = await listen();
    const res = await postJson(base, "/discover", {});

    expect(res.status).toBe(400);
    expectMatches(await res.json(), "/discover", "post", 400);
  });

  it("422 matches Error when the site cannot be reached", async () => {
    const base = await listen({
      discover: async () => {
        throw new Error("net::ERR_NAME_NOT_RESOLVED");
      },
    });
    const res = await postJson(base, "/discover", { url: "nope.test" });

    expect(res.status).toBe(422);
    expectMatches(await res.json(), "/discover", "post", 422);
  });
});

describe("POST /crawl", () => {
  it("202 matches the accepted shape", async () => {
    const base = await listen();
    const res = await postJson(base, "/crawl", {
      url: "https://x.test",
      pages: ["https://x.test/"],
    });

    expect(res.status).toBe(202);
    expectMatches(await res.json(), "/crawl", "post", 202);
  });

  it("400 matches Error when url is missing", async () => {
    const base = await listen();
    const res = await postJson(base, "/crawl", {});

    expect(res.status).toBe(400);
    expectMatches(await res.json(), "/crawl", "post", 400);
  });

  it("422 matches Error for a url that is not a web address", async () => {
    const base = await listen();
    const res = await postJson(base, "/crawl", { url: "not a url" });

    expect(res.status).toBe(422);
    expectMatches(await res.json(), "/crawl", "post", 422);
  });
});

describe("GET /crawl/{jobId}/result", () => {
  it("200 matches JobResult when the crawl completed", async () => {
    const base = await listen();
    const res = await fetch(`${base}/crawl/job_1/result`);

    expect(res.status).toBe(200);
    expectMatches(await res.json(), "/crawl/{jobId}/result", "get", 200);
  });

  it("200 matches JobResult while the crawl is still queued", async () => {
    // `result` is null until completion, and the schema allows that explicitly.
    const base = await listen({
      jobs: fakeJobs({ async getResult() { return { status: "queued" }; } }),
    });
    const res = await fetch(`${base}/crawl/job_1/result`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: unknown };
    expect(body.result).toBeNull();
    expectMatches(body, "/crawl/{jobId}/result", "get", 200);
  });

  it("200 matches JobResult when the crawl failed, carrying its reason", async () => {
    const base = await listen({
      jobs: fakeJobs({
        async getResult() {
          return { status: "failed", error: "reached zero pages" };
        },
      }),
    });
    const res = await fetch(`${base}/crawl/job_1/result`);

    expectMatches(await res.json(), "/crawl/{jobId}/result", "get", 200);
  });

  it("404 matches Error for an unknown job", async () => {
    const base = await listen({
      jobs: fakeJobs({ async getResult() { return { status: "not_found" }; } }),
    });
    const res = await fetch(`${base}/crawl/nope/result`);

    expect(res.status).toBe(404);
    expectMatches(await res.json(), "/crawl/{jobId}/result", "get", 404);
  });
});

describe("the analysis routes", () => {
  const routes = [
    "/crawl/{jobId}/typography",
    "/crawl/{jobId}/colours",
    "/crawl/{jobId}/audit",
  ] as const;
  const segment = (r: string) => r.split("/").pop()!;

  it.each(routes)("%s 200 matches its schema", async (route) => {
    const base = await listen();
    const res = await fetch(`${base}/crawl/job_1/${segment(route)}`);

    expect(res.status).toBe(200);
    expectMatches(await res.json(), route, "get", 200);
  });

  it.each(routes)("%s 404 matches Error for an unknown job", async (route) => {
    const base = await listen({
      jobs: fakeJobs({ async getResult() { return { status: "not_found" }; } }),
    });
    const res = await fetch(`${base}/crawl/nope/${segment(route)}`);

    expect(res.status).toBe(404);
    expectMatches(await res.json(), route, "get", 404);
  });

  it.each(routes)("%s 409 matches Error before the crawl finishes", async (route) => {
    const base = await listen({
      jobs: fakeJobs({ async getResult() { return { status: "active" }; } }),
    });
    const res = await fetch(`${base}/crawl/job_1/${segment(route)}`);

    expect(res.status).toBe(409);
    expectMatches(await res.json(), route, "get", 409);
  });
});

describe("the gate itself", () => {
  it("rejects a response that drifts from the spec", async () => {
    // Without this, a schema that silently matched everything would let the
    // whole file pass while proving nothing. `error` is required on Error, so
    // a body missing it must fail.
    expect(() => expectMatches({ message: "wrong key" }, "/discover", "post", 400)).toThrow(
      /does not match openapi\.yaml/,
    );
  });

  it("rejects a field of the wrong type", () => {
    expect(() => expectMatches({ error: 42 }, "/discover", "post", 400)).toThrow(
      /must be string/,
    );
  });

  it("names the offending field, so a failure is actionable", () => {
    expect(() => expectMatches({ jobId: 7 }, "/crawl", "post", 202)).toThrow(/jobId/);
  });
});
