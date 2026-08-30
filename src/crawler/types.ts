/**
 * The crawl contract.
 *
 * The per-element shapes (RawElement, ElementStyle, ExtractedElement) now
 * live in `haus-style-probe`, the shared measuring tool. They are re-exported
 * here so the rest of drift keeps importing its contract from one place, and
 * so the seam is visible: everything below this re-export is crawl-specific
 * (pages, sitemaps, discovery, authored CSS) and belongs to drift alone.
 *
 * The probe answers "what is this element rendering?". This module answers
 * "what did we find across a site?".
 */

export type { RawElement, ElementStyle, ExtractedElement } from "haus-style-probe";

import type { ExtractedElement } from "haus-style-probe";

/** A min/max-width condition pulled from an @media rule. */
export interface MediaBreakpoint {
  value: number;
  type: "min" | "max";
}

/** The token categories we read authored units for (from the CSSOM). */
export type AuthoredCategoryName = "spacing" | "type" | "radius" | "border";

/**
 * A single authored declaration read from a stylesheet rule: the *value string
 * as written* (`0.5rem`, `8px 16px`, `clamp(1rem, 2vw, 3rem)`), before unit
 * classification. `getComputedStyle` throws this away; the CSSOM preserves it.
 */
export interface RawAuthoredDeclaration {
  category: AuthoredCategoryName;
  value: string;
}

/** A CSS custom property declared on :root / html: the site's own token. */
export interface RawCustomProperty {
  name: string;
  value: string;
}

/** Authored values read from a page's stylesheets (raw strings, parsed Node-side). */
export interface RawAuthoredCss {
  declarations: RawAuthoredDeclaration[];
  customProperties: RawCustomProperty[];
}

export interface PageExtraction {
  url: string;
  title: string;
  elementCount: number;
  elements: ExtractedElement[];
  /** Breakpoints from @media rules in accessible stylesheets. */
  breakpoints?: MediaBreakpoint[];
  /** Authored values + custom properties read from the CSSOM. Absent pre-authored crawls. */
  authored?: RawAuthoredCss;
}

export interface CrawlResult {
  rootUrl: string;
  /** ISO 8601. */
  crawledAt: string;
  pages: PageExtraction[];
}

/** An anchor as seen in the page (raw href + visible text). */
export interface NavLink {
  href: string;
  text: string;
}

/** A page offered to the user to audit. */
export interface DiscoveredPage {
  url: string;
  path: string;
  title: string;
}

export interface DiscoverResult {
  rootUrl: string;
  host: string;
  pages: DiscoveredPage[];
  /** How the pages were found: a sitemap, or homepage anchors (fallback). */
  via?: "sitemap" | "links";
}

export interface CrawlOptions {
  /** Page ceiling for this crawl. Clamped to 1–MAX_CRAWL_PAGES. */
  maxPages: number;
  /**
   * Exact pages to crawl (the user's selection, or all discovered pages). When
   * present and non-empty, only these same-origin URLs are visited. When absent,
   * the crawler falls back to breadth-first discovery from the root.
   */
  pages?: string[];
  /** Per-page navigation timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Called after each page is extracted. The seam for progress reporting:
   * the queue worker reports job progress here; the WebSocket layer streams it.
   */
  onPage?: (page: PageExtraction, index: number) => void | Promise<void>;
}
