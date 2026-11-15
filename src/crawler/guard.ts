/**
 * The crawler's network guard.
 *
 * The API refuses a site on a private network before it queues it, but that
 * only checks the address the caller typed. A public page can redirect to
 * `http://10.0.0.5/`, embed an iframe of the metadata endpoint, or load a
 * script from a loopback port, and the headless browser would follow each
 * one. So every request the browser makes, page or asset or WebSocket, is
 * checked against the same rule before it leaves.
 *
 * One limit remains: the check resolves the host with Node's resolver and the
 * browser then resolves it again with its own. A name whose answer changes in
 * between (DNS rebinding) can pass the check and load somewhere else. ARCHITECTURE
 * records this as a known trade-off.
 */

import type { APIResponse, BrowserContext, Route } from "playwright";
import { isCrawlableHost } from "../net/publicUrl.js";

type HostCheck = (host: string) => Promise<boolean>;

/**
 * Whether one browser request may go ahead. Schemes that reach no host (`data:`,
 * `blob:`) continue; http(s) continues only to a host the check accepts;
 * anything else is aborted. The cache holds one answer per host for the life
 * of a crawl, so a page with a hundred assets costs one lookup per host.
 */
export async function requestDecision(
  url: string,
  check: HostCheck,
  cache: Map<string, Promise<boolean>>,
): Promise<"continue" | "abort"> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "abort";
  }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return "continue";
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "abort";
  const host = parsed.hostname;
  let answer = cache.get(host);
  if (!answer) {
    answer = check(host);
    cache.set(host, answer);
  }
  return (await answer) ? "continue" : "abort";
}

/** Redirects walked per request before it is refused. */
const MAX_REDIRECTS = 5;

/**
 * Whether every hop of a redirect chain is allowed. Each `Location` is checked,
 * then requested with redirects off, up to `MAX_REDIRECTS`. A response that is
 * not a redirect ends the walk.
 */
export async function redirectsStayPublic(
  url: string,
  first: APIResponse,
  route: Route,
  check: HostCheck,
  cache: Map<string, Promise<boolean>>,
): Promise<boolean> {
  let current = url;
  let response = first;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const location =
      response.status() >= 300 && response.status() < 400
        ? response.headers()["location"]
        : undefined;
    if (!location) return true;
    current = new URL(location, current).toString();
    if ((await requestDecision(current, check, cache)) === "abort") return false;
    response = await route.fetch({ url: current, maxRedirects: 0 });
  }
  return false;
}

/** Route every request and WebSocket a context makes through `requestDecision`. */
export async function guardContext(
  context: BrowserContext,
  check: HostCheck = (host) => isCrawlableHost(host),
): Promise<void> {
  const cache = new Map<string, Promise<boolean>>();
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if ((await requestDecision(url, check, cache)) === "abort") {
      await route.abort("blockedbyclient");
      return;
    }
    if (!/^https?:/i.test(url)) {
      await route.continue();
      return;
    }
    // Fetched here with redirects off, then handed to the page. Playwright only
    // routes the first request of a redirect chain: the browser follows every
    // later hop itself, unchecked, whether the request continued or was
    // fulfilled with the 3xx. So the chain is walked here first, each hop
    // checked, and the page only gets the 3xx when every hop is allowed.
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (!(await redirectsStayPublic(url, response, route, check, cache))) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({ response });
    } catch {
      await route.abort("failed");
    }
  });
  await context.routeWebSocket(/.*/, async (ws) => {
    // A WebSocket URL is ws(s), checked as the http(s) host it connects to.
    const asHttp = ws.url().replace(/^ws/, "http");
    if ((await requestDecision(asHttp, check, cache)) === "continue") ws.connectToServer();
    else await ws.close();
  });
}
