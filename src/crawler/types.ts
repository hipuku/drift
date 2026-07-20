/**
 * The raw extraction contract.
 *
 * This is the boundary between the crawler and everything downstream
 * (clustering, contrast checking, reporting). Two shapes live here:
 *
 *  - RawElement      what the in-browser extractor returns: untouched
 *                    getComputedStyle strings, no parsing in the page context.
 *  - ExtractedElement what the Node-side normaliser produces: typed,
 *                     unit-normalised values ready for analysis.
 *
 * Keeping raw strings on one side and normalised values on the other means
 * the normalisation is pure, runs outside the browser, and is unit-testable
 * without launching Chromium.
 */

/** Untouched computed-style strings for a single element, gathered in-page. */
export interface RawElement {
  tag: string;
  /** True when the element has non-whitespace direct text (a contrast candidate). */
  hasText: boolean;
  raw: {
    color: string;
    backgroundColor: string;
    /** Nearest non-transparent ancestor background (incl. self); page canvas as fallback. */
    effectiveBackgroundColor: string;
    borderTopColor: string;
    borderRightColor: string;
    borderBottomColor: string;
    borderLeftColor: string;
    borderTopWidth: string;
    borderRightWidth: string;
    borderBottomWidth: string;
    borderLeftWidth: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomRightRadius: string;
    borderBottomLeftRadius: string;
    boxShadow: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    marginTop?: string;
    marginRight?: string;
    marginBottom?: string;
    marginLeft?: string;
    rowGap?: string;
    columnGap?: string;
  };
}

/** Normalised, typed styles for a single element. Nulls mean "not set / not meaningful". */
export interface ElementStyle {
  /** Hex, lowercase. Includes a trailing alpha pair when alpha < 1. Null when fully transparent. */
  color: string | null;
  backgroundColor: string | null;
  /**
   * The background a reader actually sees behind this element's text:
   * the nearest non-transparent ancestor background, or the page canvas.
   * This is the value to pair with `color` for contrast.
   */
  effectiveBackgroundColor: string | null;
  /** Unique border colours across the four sides, nulls dropped. */
  borderColor: string[];
  /** First family in the stack, unquoted. */
  fontFamily: string | null;
  /** Pixels. */
  fontSize: number | null;
  /** Numeric weight (normal → 400, bold → 700). */
  fontWeight: number | null;
  /** Unitless ratio relative to font-size. Null for `normal`. */
  lineHeight: number | null;
  /** Em, relative to font-size. 0 for `normal`. */
  letterSpacing: number;
  /** Unique corner radii in pixels. */
  borderRadius: number[];
  /** Raw shadow value. Null for `none`. */
  boxShadow: string | null;
  /** [top, right, bottom, left] in pixels. */
  padding: [number, number, number, number];
  /** [top, right, bottom, left] in pixels. Can be negative. Absent on pre-margin crawls. */
  margin?: [number, number, number, number];
  /** Distinct flex/grid gap values (row + column) in pixels. Absent on pre-gap crawls. */
  gap?: number[];
  /** Border widths [top, right, bottom, left] in pixels. Absent on pre-border crawls. */
  borderWidths?: [number, number, number, number];
}

export interface ExtractedElement {
  tag: string;
  hasText: boolean;
  styles: ElementStyle;
}

export interface PageExtraction {
  url: string;
  title: string;
  elementCount: number;
  elements: ExtractedElement[];
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
  /** How the pages were found — a sitemap, or homepage anchors (fallback). */
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
