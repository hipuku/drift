/**
 * Who may reach the API, and how often.
 *
 * Every crawl drives a headless browser on the server for up to a minute, so
 * an open endpoint is a way to spend someone else's machine. Three controls,
 * each off or loose where the server is only reachable from the same machine:
 *
 *  - **Where it listens.** `127.0.0.1` unless `HOST` says otherwise, so a
 *    server started on a laptop or a shared box is not on the network by
 *    accident.
 *  - **An optional token.** With `DRIFT_API_TOKEN` set, every route and the
 *    progress WebSocket need `Authorization: Bearer <token>`. Unset, the API
 *    is open, which is how the client and drift-tests use it locally.
 *  - **A rate limit and a queue cap.** `POST /crawl` and `POST /discover` are
 *    limited per caller, and a crawl is refused while the queue is full. The
 *    rate limit is on by default only when the server listens beyond loopback.
 */

import { timingSafeEqual } from "node:crypto";

export interface AccessConfig {
  /** The address to listen on. */
  host: string;
  /** The bearer token every request needs, or null for an open API. */
  token: string | null;
  /** Crawl and discover requests per caller per minute; 0 is no limit. */
  ratePerMinute: number;
  /** Crawls that may wait or run at once before a new one is refused. */
  maxQueued: number;
}

/** Default requests per minute per caller, when the server is exposed. */
const EXPOSED_RATE_PER_MINUTE = 20;
const DEFAULT_MAX_QUEUED = 20;

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || /^127\./.test(host);
}

function count(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Read the access settings from an environment, defaulting each one. */
export function accessConfig(env: Record<string, string | undefined>): AccessConfig {
  const host = env.HOST?.trim() || "127.0.0.1";
  return {
    host,
    token: env.DRIFT_API_TOKEN?.trim() || null,
    ratePerMinute: count(
      env.DRIFT_RATE_LIMIT_PER_MINUTE,
      isLoopbackHost(host) ? 0 : EXPOSED_RATE_PER_MINUTE,
    ),
    maxQueued: count(env.DRIFT_MAX_QUEUED, DEFAULT_MAX_QUEUED),
  };
}

/**
 * Whether an `Authorization` header carries the token as a bearer credential.
 * Compared in constant time, so the answer's timing says nothing about how
 * much of a guess was right.
 */
export function tokenMatches(header: string | undefined, token: string): boolean {
  const match = /^Bearer (.+)$/i.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]!);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * A fixed-window counter per caller. Enough for one process, which is how
 * drift runs; a deployment with several would need a shared store.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; used: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      window = { start: now, used: 0 };
      this.windows.set(key, window);
      // Drop windows that have run out, so the map holds recent callers only.
      for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
    }
    if (window.used < this.limit) {
      window.used++;
      return { ok: true };
    }
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000)),
    };
  }
}
