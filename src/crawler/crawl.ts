/**
 * Playwright crawler.
 *
 * Breadth-first, same-origin, capped at a small number of pages. For each page
 * it drives the in-page extractor, normalises the result Node-side, and queues
 * newly discovered same-origin links. This module owns the browser lifecycle
 * and nothing else — no queue, no sockets, no analysis.
 */

import { chromium, type Browser } from "playwright";
import { extractLinks, extractRawElements } from "./extract.js";
import { normaliseElement } from "./normalise.js";
import type { CrawlOptions, CrawlResult, PageExtraction } from "./types.js";

const DEFAULT_TIMEOUT_MS = 20_000;

function clampPages(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.floor(n)));
}

/** Normalise a URL for visited-set comparison: drop hash, keep path + query. */
function canonical(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
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

  const queue: string[] = [start];
  const visited = new Set<string>();
  const pages: PageExtraction[] = [];

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    while (queue.length > 0 && pages.length < maxPages) {
      const next = queue.shift()!;
      if (visited.has(next)) continue;
      visited.add(next);

      const page = await context.newPage();
      try {
        await page.goto(next, { waitUntil: "load", timeout });

        const rawElements = await page.evaluate(extractRawElements);
        const title = await page.title();
        const elements = rawElements.map(normaliseElement);

        pages.push({
          url: next,
          title,
          elementCount: elements.length,
          elements,
        });

        if (pages.length < maxPages) {
          const hrefs = await page.evaluate(extractLinks);
          for (const href of hrefs) {
            const c = canonical(href);
            if (c && c.startsWith(origin) && !visited.has(c) && !queue.includes(c)) {
              queue.push(c);
            }
          }
        }
      } catch (err) {
        // A single failed page should not abort the crawl; skip and continue.
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`  ! skipped ${next}: ${message}\n`);
      } finally {
        await page.close();
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
