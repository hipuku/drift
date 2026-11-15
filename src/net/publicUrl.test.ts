import { afterEach, describe, expect, it } from "vitest";
import {
  assertCrawlable,
  CRAWL_PRIVATE,
  isCrawlableHost,
  isPrivateAddress,
  type Resolve,
} from "./publicUrl.js";

/** A resolver that answers from a table, so no test touches the network. */
function table(map: Record<string, Array<{ address: string; family: number }>>): Resolve {
  return async (host) => map[host] ?? [];
}

afterEach(() => {
  delete process.env.DRIFT_CRAWL_ALLOWED_HOSTS;
});

describe("isPrivateAddress", () => {
  it.each([
    ["0.0.0.0", 4],
    ["10.0.0.5", 4],
    ["100.64.0.1", 4],
    ["127.0.0.1", 4],
    ["169.254.169.254", 4],
    ["172.16.0.1", 4],
    ["192.168.1.1", 4],
    ["224.0.0.1", 4],
    ["::", 6],
    ["::1", 6],
    ["fd00::1", 6],
    ["fe80::1", 6],
    ["::ffff:127.0.0.1", 6],
    ["::ffff:7f00:1", 6],
  ])("refuses %s", (address, family) => {
    expect(isPrivateAddress(address, family)).toBe(true);
  });

  it.each([
    ["93.184.215.14", 4],
    ["172.32.0.1", 4],
    ["2606:4700::6810:84e5", 6],
  ])("accepts %s", (address, family) => {
    expect(isPrivateAddress(address, family)).toBe(false);
  });
});

describe("isCrawlableHost", () => {
  it("accepts a host that resolves only to public addresses", async () => {
    const resolve = table({ "example.com": [{ address: "93.184.215.14", family: 4 }] });
    expect(await isCrawlableHost("example.com", { resolve })).toBe(true);
  });

  it("refuses a public-looking name that resolves to loopback", async () => {
    const resolve = table({ "localtest.me": [{ address: "127.0.0.1", family: 4 }] });
    expect(await isCrawlableHost("localtest.me", { resolve })).toBe(false);
  });

  it("refuses a host when any one of its addresses is private", async () => {
    const resolve = table({
      "split.example": [
        { address: "93.184.215.14", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    });
    expect(await isCrawlableHost("split.example", { resolve })).toBe(false);
  });

  it("refuses a host that does not resolve", async () => {
    expect(await isCrawlableHost("nope.invalid", { resolve: table({}) })).toBe(false);
  });

  it("checks an IPv6 literal without its brackets", async () => {
    expect(await isCrawlableHost("[::1]")).toBe(false);
  });

  it("accepts a private host the operator allowlisted", async () => {
    process.env.DRIFT_CRAWL_ALLOWED_HOSTS = "localhost, fixtures.internal";
    const resolve = table({ "fixtures.internal": [{ address: "10.0.0.9", family: 4 }] });
    expect(await isCrawlableHost("fixtures.internal", { resolve })).toBe(true);
    expect(await isCrawlableHost("LOCALHOST", { resolve })).toBe(true);
  });
});

describe("assertCrawlable", () => {
  it("refuses a cloud metadata address", async () => {
    await expect(assertCrawlable("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      CRAWL_PRIVATE,
    );
  });

  it("refuses a bare private address, as the crawler would read it", async () => {
    await expect(assertCrawlable("10.0.0.5")).rejects.toThrow(CRAWL_PRIVATE);
  });

  it("lets an address that does not resolve through, for the crawl to report", async () => {
    await expect(assertCrawlable("https://nope.invalid/", { resolve: table({}) })).resolves.toBe(
      undefined,
    );
  });

  it("accepts a public site", async () => {
    const resolve = table({ "example.com": [{ address: "93.184.215.14", family: 4 }] });
    await expect(assertCrawlable("example.com", { resolve })).resolves.toBe(undefined);
  });
});
