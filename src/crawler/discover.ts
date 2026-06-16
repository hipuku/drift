/**
 * Page discovery.
 *
 * Loads a site's homepage in Playwright, reads its anchors, and returns the
 * same-origin page list the user picks from. One page load — fast — and the
 * normalisation is delegated to the pure helper so it stays testable.
 */

import { chromium, type Browser } from "playwright";
import { normaliseDiscovered } from "./discoverNormalise.js";
import { extractNavLinks } from "./extract.js";
import type { DiscoverResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 20_000;

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

export async function discoverPages(
  rootUrl: string,
  options: { timeoutMs?: number; maxPages?: number } = {},
): Promise<DiscoverResult> {
  const start = canonical(rootUrl);
  const host = new URL(start).host;

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(start, { waitUntil: "load", timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    const links = await page.evaluate(extractNavLinks);
    const pages = normaliseDiscovered(start, links, options.maxPages ?? 50);
    return { rootUrl: start, host, pages };
  } finally {
    await browser?.close();
  }
}
