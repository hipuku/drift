/**
 * Webhook delivery.
 *
 * A crawl runs for minutes, so a caller that isn't a browser — CI, a script —
 * shouldn't have to poll. Give it a `callbackUrl` and Drift posts the finished
 * audit (or the failure) to it.
 *
 * Two things this module takes seriously:
 *
 *  - **The URL is user-supplied**, so it is an SSRF vector: without a guard, a
 *    caller could make the server fetch its own metadata endpoint or something
 *    else on the private network. `assertDeliverable` rejects anything that
 *    isn't public http(s).
 *  - **Delivery is best-effort**, and must never take the crawl down with it.
 *    Failures are retried a couple of times and then dropped; the audit is still
 *    available from the API either way.
 */

import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { SiteAudit } from "../analysis/audit.js";

/** Give up on a single delivery attempt after this long. */
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export type WebhookEvent =
  | { event: "crawl.completed"; jobId: string; site: string; audit: SiteAudit }
  | { event: "crawl.failed"; jobId: string; site: string; error: string };

/** Private, loopback, link-local and unique-local ranges — never deliverable. */
function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const v6 = address.toLowerCase();
    return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Hosts the operator has explicitly allowlisted via `DRIFT_WEBHOOK_ALLOWED_HOSTS`
 * (comma-separated), exempt from the private-address refusal. Empty by default,
 * so the SSRF guard is fully on unless someone opts a trusted internal host in —
 * for example a receiver inside the same network, or a loopback receiver in a
 * test run. Read fresh each call so tests and config can set it at runtime.
 */
function allowedHosts(): Set<string> {
  return new Set(
    (process.env.DRIFT_WEBHOOK_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Throw unless the URL is a public http(s) endpoint. Resolves the host, because
 * a name can point anywhere — `localtest.me` resolves to 127.0.0.1. A host in
 * `DRIFT_WEBHOOK_ALLOWED_HOSTS` bypasses the private-address check.
 */
export async function assertDeliverable(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("callbackUrl must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("callbackUrl must be http or https.");
  }
  const resolved = await lookup(url.hostname, { all: true }).catch(() => []);
  if (resolved.length === 0) {
    throw new Error("callbackUrl host could not be resolved.");
  }
  const allowlisted = allowedHosts().has(url.hostname.toLowerCase());
  if (!allowlisted && resolved.some((r) => isPrivateAddress(r.address, r.family))) {
    throw new Error("callbackUrl must not point at a private or loopback address.");
  }
  return url;
}

/**
 * Sign the body so the receiver can verify it came from us. Only when
 * DRIFT_WEBHOOK_SECRET is set — unsigned delivery is fine for a local CI run.
 */
function signature(body: string): string | null {
  const secret = process.env.DRIFT_WEBHOOK_SECRET;
  if (!secret) return null;
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Deliver one event, retrying a transient failure. Never throws — a webhook the
 * receiver can't accept is not a reason to fail an audit that succeeded.
 */
export async function deliver(callbackUrl: string, payload: WebhookEvent): Promise<boolean> {
  let url: URL;
  try {
    url = await assertDeliverable(callbackUrl);
  } catch {
    return false; // validated at the edge; a late failure is not worth retrying
  }

  const body = JSON.stringify(payload);
  const sig = signature(body);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "drift-webhook/1",
          "x-drift-event": payload.event,
          ...(sig ? { "x-drift-signature": sig } : {}),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return true;
      // 4xx is the receiver rejecting us — retrying won't change their mind.
      if (res.status >= 400 && res.status < 500) return false;
    } catch {
      // network error or timeout — fall through to the retry
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  return false;
}
