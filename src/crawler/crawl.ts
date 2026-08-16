/**
 * Playwright crawler.
 *
 * Two modes, sharing one per-page extractor:
 *
 *  1. Explicit pages — when the caller passes a `pages` list (the user's picked
 *     pages, or all discovered pages), the crawler visits exactly those URLs.
 *     This is how a chosen deep page actually gets crawled.
 *  2. Breadth-first (fallback) — with no `pages`, it walks same-origin links
 *     from the root up to the page cap. Used when discovery found nothing to
 *     pick from.
 *
 * Either way it drives the in-page extractor, normalises Node-side, and owns the
 * browser lifecycle and nothing else — no queue, no sockets, no analysis.
 */

import { chromium, type BrowserContext, type Browser } from "playwright";
import {
  extractAuthoredDeclarations,
  extractBreakpoints,
  extractLinks,
  extractRawElements,
} from "./extract.js";
import { normaliseElement } from "./normalise.js";
import type { CrawlOptions, CrawlResult, PageExtraction } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Hard ceiling on pages per crawl — bounds time, memory, and politeness.
 * Kept modest while the pipeline still retains every page's raw elements
 * (memory scales with elements × pages). Raises to ~25 once the crawl aggregates
 * incrementally. The design language lives in the shared stylesheet, so a handful
 * of pages already captures the system; more pages only add attribution.
 */
export const MAX_CRAWL_PAGES = 10;

export function clampPages(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_CRAWL_PAGES, Math.floor(n)));
}

/** Normalise a URL: drop hash, keep path + query. Adds https:// to bare hosts. */
function canonical(url: string): string | null {
  for (const candidate of [url, `https://${url}`]) {
    try {
      const u = new URL(candidate);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      return u.toString();
    } catch {
      // try next
    }
  }
  return null;
}

interface Visit {
  extraction: PageExtraction;
  hrefs: string[];
}

/** Load one page and extract its elements. Returns null on failure (skip it). */
async function visit(context: BrowserContext, url: string, timeout: number): Promise<Visit | null> {
  const page = await context.newPage();
  try {
    // "domcontentloaded" (not "load") — stylesheets are applied by then, but we
    // don't wait on images / fonts / third-party scripts, which is what makes
    // slow sites blow past the timeout.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    const rawElements = await page.evaluate(extractRawElements);
    const title = await page.title();
    const elements = rawElements.map(normaliseElement);
    const hrefs = await page.evaluate(extractLinks);
    const breakpoints = await page.evaluate(extractBreakpoints);
    const authored = await page.evaluate(extractAuthoredDeclarations);
    return {
      extraction: { url, title, elementCount: elements.length, elements, breakpoints, authored },
      hrefs,
    };
  } catch (err) {
    // A single failed page should not abort the crawl; skip and continue.
    process.stderr.write(`  ! skipped ${url}: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  } finally {
    await page.close();
  }
}

export async function crawl(rootUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const maxPages = clampPages(options.maxPages);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const start = canonical(rootUrl);
  if (!start) {
    throw new Error(`Invalid or unsupported URL: ${rootUrl}`);
  }
  const origin = new URL(start).origin;

  // Explicit targets: caller-selected pages, same-origin, deduped, capped.
  const explicit = [
    ...new Set(
      (options.pages ?? [])
        .map((u) => canonical(u))
        .filter((u): u is string => u !== null && u.startsWith(origin)),
    ),
  ].slice(0, maxPages);

  const pages: PageExtraction[] = [];
  const record = async (v: Visit) => {
    pages.push(v.extraction);
    await options.onPage?.(v.extraction, pages.length - 1);
  };

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (explicit.length > 0) {
      // Visit exactly the selected pages.
      for (const url of explicit) {
        if (pages.length >= maxPages) break;
        const v = await visit(context, url, timeout);
        if (v) await record(v);
      }
    } else {
      // Breadth-first from the root, following same-origin links.
      const queue: string[] = [start];
      const visited = new Set<string>();
      while (queue.length > 0 && pages.length < maxPages) {
        const next = queue.shift()!;
        if (visited.has(next)) continue;
        visited.add(next);

        const v = await visit(context, next, timeout);
        if (!v) continue;
        await record(v);

        if (pages.length < maxPages) {
          for (const href of v.hrefs) {
            const c = canonical(href);
            if (c && c.startsWith(origin) && !visited.has(c) && !queue.includes(c)) {
              queue.push(c);
            }
          }
        }
      }
    }
  } finally {
    await browser?.close();
  }

  return {
    rootUrl: start,
    crawledAt: new Date().toISOString(),
    pages,
  };
}
