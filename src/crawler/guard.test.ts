import { describe, expect, it } from "vitest";
import type { APIResponse, Route } from "playwright";
import { redirectsStayPublic, requestDecision } from "./guard.js";

/** A host check that answers from a list, and counts how often it is asked. */
function hosts(publicHosts: string[]) {
  const asked: string[] = [];
  const check = async (host: string) => {
    asked.push(host);
    return publicHosts.includes(host);
  };
  return { check, asked };
}

describe("requestDecision", () => {
  it("continues a request to a public host", async () => {
    const { check } = hosts(["picocss.com"]);
    expect(await requestDecision("https://picocss.com/css/pico.css", check, new Map())).toBe(
      "continue",
    );
  });

  it("aborts a request to a private host, such as a redirect target", async () => {
    const { check } = hosts(["picocss.com"]);
    expect(
      await requestDecision("http://169.254.169.254/latest/meta-data/", check, new Map()),
    ).toBe("abort");
  });

  it("aborts a URL that does not parse", async () => {
    const { check } = hosts([]);
    expect(await requestDecision("not a url", check, new Map())).toBe("abort");
  });

  it("lets data and blob URLs through, which reach no host", async () => {
    const { check, asked } = hosts([]);
    expect(await requestDecision("data:image/png;base64,AAAA", check, new Map())).toBe("continue");
    expect(await requestDecision("blob:https://picocss.com/1234", check, new Map())).toBe(
      "continue",
    );
    expect(asked).toEqual([]);
  });

  it("aborts any other scheme", async () => {
    const { check } = hosts([]);
    expect(await requestDecision("file:///etc/passwd", check, new Map())).toBe("abort");
  });

  it("asks once per host within a crawl", async () => {
    const { check, asked } = hosts(["picocss.com"]);
    const cache = new Map<string, Promise<boolean>>();
    await requestDecision("https://picocss.com/", check, cache);
    await requestDecision("https://picocss.com/docs", check, cache);
    expect(asked).toEqual(["picocss.com"]);
  });
});

describe("redirectsStayPublic", () => {
  /** A response with a status and, for a redirect, a Location. */
  const reply = (status: number, location?: string) =>
    ({
      status: () => status,
      headers: () => (location ? { location } : {}),
    }) as unknown as APIResponse;

  /** A route whose fetch answers from a table and records what it was asked for. */
  function route(map: Record<string, APIResponse>) {
    const asked: string[] = [];
    const fake = {
      fetch: async ({ url }: { url: string }) => {
        asked.push(url);
        return map[url] ?? reply(200);
      },
    } as unknown as Route;
    return { fake, asked };
  }

  const publicOnly = async (host: string) => host !== "10.0.0.5" && host !== "169.254.169.254";

  it("passes a response that is not a redirect", async () => {
    const { fake, asked } = route({});
    expect(
      await redirectsStayPublic("https://a.example/", reply(200), fake, publicOnly, new Map()),
    ).toBe(true);
    expect(asked).toEqual([]);
  });

  it("walks a public chain to its end", async () => {
    const { fake, asked } = route({
      "https://a.example/next": reply(301, "/final"),
    });
    expect(
      await redirectsStayPublic(
        "https://a.example/",
        reply(302, "https://a.example/next"),
        fake,
        publicOnly,
        new Map(),
      ),
    ).toBe(true);
    expect(asked).toEqual(["https://a.example/next", "https://a.example/final"]);
  });

  it("refuses a chain whose second hop is private, without requesting it", async () => {
    const { fake, asked } = route({
      "https://a.example/next": reply(302, "http://169.254.169.254/latest/"),
    });
    expect(
      await redirectsStayPublic(
        "https://a.example/",
        reply(302, "https://a.example/next"),
        fake,
        publicOnly,
        new Map(),
      ),
    ).toBe(false);
    expect(asked).toEqual(["https://a.example/next"]);
  });

  it("refuses a chain longer than five redirects", async () => {
    const map: Record<string, APIResponse> = {};
    for (let i = 1; i <= 10; i++) map[`https://a.example/${i}`] = reply(302, `/${i + 1}`);
    const { fake } = route(map);
    expect(
      await redirectsStayPublic(
        "https://a.example/0",
        reply(302, "/1"),
        fake,
        publicOnly,
        new Map(),
      ),
    ).toBe(false);
  });
});
