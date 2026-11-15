import { describe, expect, it } from "vitest";
import { accessConfig, isLoopbackHost, RateLimiter, tokenMatches } from "./access.js";

describe("tokenMatches", () => {
  it("accepts the token as a bearer credential", () => {
    expect(tokenMatches("Bearer s3cret-token", "s3cret-token")).toBe(true);
  });

  it("is case-insensitive about the scheme only", () => {
    expect(tokenMatches("bearer s3cret-token", "s3cret-token")).toBe(true);
    expect(tokenMatches("Bearer S3CRET-TOKEN", "s3cret-token")).toBe(false);
  });

  it.each([undefined, "", "s3cret-token", "Basic s3cret-token", "Bearer", "Bearer s3cret"])(
    "refuses %s",
    (header) => {
      expect(tokenMatches(header, "s3cret-token")).toBe(false);
    },
  );
});

describe("RateLimiter", () => {
  it("allows the limit within a window, then refuses with the seconds left", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 60_000, () => now);
    expect([1, 2, 3].map(() => limiter.take("a").ok)).toEqual([true, true, true]);
    now = 15_000;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 45 });
  });

  it("counts each caller separately", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
  });

  it("starts a new window once the old one has passed", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 60_000, () => now);
    limiter.take("a");
    now = 60_000;
    expect(limiter.take("a").ok).toBe(true);
  });
});

describe("isLoopbackHost", () => {
  it.each(["127.0.0.1", "::1", "localhost"])("treats %s as loopback", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(["0.0.0.0", "::", "192.168.1.20"])("treats %s as exposed", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("accessConfig", () => {
  it("listens on loopback, with no token and no rate limit, by default", () => {
    expect(accessConfig({})).toEqual({
      host: "127.0.0.1",
      token: null,
      ratePerMinute: 0,
      maxQueued: 20,
    });
  });

  it("turns the rate limit on once the server is exposed", () => {
    expect(accessConfig({ HOST: "0.0.0.0" }).ratePerMinute).toBe(20);
  });

  it("takes every value from the environment when set", () => {
    expect(
      accessConfig({
        HOST: "0.0.0.0",
        DRIFT_API_TOKEN: "t",
        DRIFT_RATE_LIMIT_PER_MINUTE: "0",
        DRIFT_MAX_QUEUED: "5",
      }),
    ).toEqual({ host: "0.0.0.0", token: "t", ratePerMinute: 0, maxQueued: 5 });
  });
});
