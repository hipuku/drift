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
  };
}

/** Normalised, typed styles for a single element. Nulls mean "not set / not meaningful". */
export interface ElementStyle {
  /** Hex, lowercase. Includes a trailing alpha pair when alpha < 1. Null when fully transparent. */
  color: string | null;
  backgroundColor: string | null;
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

export interface CrawlOptions {
  /** Number of pages to visit, same-origin, breadth-first. Clamped to 1–5. */
  maxPages: number;
  /** Per-page navigation timeout in milliseconds. */
  timeoutMs?: number;
}
