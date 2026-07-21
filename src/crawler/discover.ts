/**
 * Page discovery.
 *
 * Two strategies, in order:
 *
 *  1. Sitemap — fetch robots.txt, follow its Sitemap: directive(s), parse the
 *     XML (recursing through index files). Reaches every published page,
 *     including deep ones a homepage never links to. Cheap HTTP, no browser.
 *  2. Homepage links (fallback) — when no sitemap is reachable, load the
 *     homepage in Playwright and read its anchors. Only reaches homepage-linked
 *     pages, but needs no sitemap.
 *
 * Both return the same same-origin page list the user picks from.
 */

import { chromium, type Browser } from "playwright";
import { normaliseDiscovered } from "./discoverNormalise.js";
import { extractNavLinks } from "./extract.js";
import { discoverSitemapUrls, resolveReachableUrl, sitemapUrlsToPages } from "./sitemap.js";
import type { DiscoverResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/** Accept bare hosts ("example.com") as well as full URLs. */
function canonical(input: string): string {
  for (const candidate of [input, `https://${input}`]) {
    try {
      const u = new URL(candidate);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      // try next
    }
  }
  throw new Error(`Invalid or unsupported URL: ${input}`);
}

/** Fallback discovery: read the homepage's anchors in a headless browser. */
async function discoverViaLinks(
  start: string,
  timeoutMs: number,
  maxPages: number,
): Promise<DiscoverResult["pages"]> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(start, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const links = await page.evaluate(extractNavLinks);
    return normaliseDiscovered(start, links, maxPages);
  } finally {
    await browser?.close();
  }
}

export async function discoverPages(
  rootUrl: string,
  options: { timeoutMs?: number; maxPages?: number } = {},
): Promise<DiscoverResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Listing is cheap (sitemap parse / homepage anchors), so list generously —
  // every page should be searchable in the picker. The audit itself is bounded
  // separately by MAX_CRAWL_PAGES. The high cap only guards pathological sitemaps.
  const maxPages = options.maxPages ?? 1000;

  // Resolve to a reachable URL first (some sites live only at www, or only at
  // the apex). Fall back to a best-effort canonical guess if nothing responds.
  const start = (await resolveReachableUrl(rootUrl, { timeoutMs })) ?? canonical(rootUrl);
  const host = new URL(start).host;

  // 1. Sitemap first — reaches deep pages, no browser.
  const sitemapUrls = await discoverSitemapUrls(start, { timeoutMs });
  if (sitemapUrls) {
    const pages = sitemapUrlsToPages(start, sitemapUrls, maxPages);
    if (pages.length > 0) return { rootUrl: start, host, pages, via: "sitemap" };
  }

  // 2. Fallback — homepage anchors.
  const pages = await discoverViaLinks(start, timeoutMs, maxPages);
  return { rootUrl: start, host, pages, via: "links" };
}
