/**
 * The backend contract, client side.
 *
 * Mirrors the server's request/response shapes (src/queue/crawlQueue.ts,
 * src/analysis/*) and wraps every call to the `/api` proxy in a thin helper that
 * surfaces the server's friendly `error` string. Kept in one place so the
 * screens fetch through typed functions, never raw URLs. Deterministic, with no model.
 */

import {
  DEMO_MODE,
  demoAudit,
  demoCrawlStatus,
  demoDiscover,
  demoStartCrawl,
  type DiscoveryResponse,
} from "../demo/index.js";

export type { DiscoveryResponse };

// ── Wire types (mirror the backend) ─────────────────────────────────────────

export interface CrawlProgress {
  pagesCrawled: number;
  maxPages: number;
  lastUrl: string;
  lastTitle?: string;
  lastElements?: number;
  elementsTotal?: number;
}

export interface CrawlResultMeta {
  rootUrl: string;
  crawledAt: string;
  pages: { url: string; title: string; elementCount: number }[];
}

/** The deterministic typography inventory (mirrors src/analysis/typography.ts). */
export interface TypographyInventory {
  families: { family: string; count: number; pages: string[] }[];
  sizes: { px: number; count: number; weights: number[]; lineHeights: number[]; pages: string[] }[];
  baseSizePx: number | null;
  primaryFamily: string | null;
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

/** Pull the server's `{ error }` message out of a failed response, if present. */
async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `Request failed (${res.status})`);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

/**
 * Enqueue a crawl of the given pages (the user's selection, or all discovered).
 * Returns the BullMQ job id used by every later call.
 */
export function startCrawl(url: string, pages: string[]): Promise<{ jobId: string }> {
  if (DEMO_MODE) return Promise.resolve(demoStartCrawl());
  return postJson("/crawl", { url, pages, maxPages: pages.length });
}

/**
 * Resolve a URL and list its pages. Lives here rather than in the screen so the
 * demo switch has a single place to sit, alongside the other calls.
 */
export async function discoverPages(url: string): Promise<DiscoveryResponse> {
  if (DEMO_MODE) return demoDiscover();
  const res = await fetch("/api/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as DiscoveryResponse;
}

export interface CrawlStatus {
  status: string; // queued | active | completed | failed | not_found | …
  result: CrawlResultMeta | null;
  /** Why a failed crawl failed, when the worker gave a reason. */
  error?: string;
}

/** Poll the crawl's status/result. Authoritative source of crawl completion. */
export async function getCrawlStatus(jobId: string): Promise<CrawlStatus> {
  if (DEMO_MODE) return demoCrawlStatus();
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/result`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as CrawlStatus;
}

/** The typography inventory for a completed crawl, which seeds the type proposals. */
export async function getTypography(jobId: string): Promise<TypographyInventory> {
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/typography`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as TypographyInventory;
}

/** One perceptual colour cluster from the crawl. */
export interface ColourCluster {
  representative: string;
  members: string[];
  size: number;
  totalUsage: number;
  pages: string[];
}

export interface ColourInventory {
  clusters: ColourCluster[];
  clusterCount: number;
  distinctColours: number;
}

/** The colour inventory for a completed crawl, which seeds the consolidation proposal. */
export async function getColours(jobId: string): Promise<ColourInventory> {
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/colours`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as ColourInventory;
}

// ── The deterministic audit (the "what it is" diagnosis) ─────────────────────

export interface AuditColourElementUsage {
  tag: string;
  role: "text" | "background" | "border";
  count: number;
}

export interface AuditColourSwatch {
  hex: string;
  count: number;
  roles: { text: number; background: number; border: number };
  /** Which element types use this colour, in which role. */
  elements: AuditColourElementUsage[];
  pages: string[];
  lightness: number;
  /** The perceptually-closest other colour on the site, and the ΔE to it. */
  nearest?: { hex: string; deltaE: number };
  /** Every colour worth relating this one to: opacity variants and near-duplicates. */
  related?: AuditColourRelation[];
}

export interface AuditColourRelation {
  hex: string;
  deltaE: number;
  /** Same RGB base as the subject, differing only in alpha. */
  opacityVariant: boolean;
}

export interface AuditColourFamily {
  name: string;
  swatches: AuditColourSwatch[];
  count: number;
}

export interface AuditTypeRole {
  tag: string;
  px: number;
  weight: number | null;
  count: number;
}

export interface AuditTypeSize {
  px: number;
  count: number;
  /** All font-weights seen at this size, most-used first. */
  weights: number[];
  /** Element tags that render text at this size, most-used first. */
  tags: { tag: string; count: number }[];
}

export interface AuditValueUsage {
  value: number;
  count: number;
}

export type AuditSpacingProperty = "padding" | "margin" | "gap";

export interface AuditSpacingUsage {
  value: number;
  count: number;
  /** Which CSS properties produce this value, most-used first. */
  properties: { property: AuditSpacingProperty; count: number }[];
  /** Element tags using this value, most-used first. */
  tags: { tag: string; count: number }[];
}

/** A token whose value is a CSS string (shadow, gradient, easing, …). */
export interface AuditStringUsage {
  value: string;
  count: number;
}

export interface AuditTagUsage {
  tag: string;
  count: number;
}

export interface AuditRadiusUsage {
  value: number;
  count: number;
  /** Element tags using this radius, most-used first. */
  tags: AuditTagUsage[];
}

export interface AuditShadowUsage {
  value: string;
  count: number;
  /** Element tags using this shadow, most-used first. */
  tags: AuditTagUsage[];
}

export interface AuditBreakpointUsage {
  value: number;
  count: number;
  /** min-width vs max-width split, most-used first. */
  types: { type: "min" | "max"; count: number }[];
}

export type AuditBorderSide = "top" | "right" | "bottom" | "left";

export interface AuditBorderUsage {
  value: number;
  count: number;
  /** Which sides carry this width, most-used first. */
  sides: { side: AuditBorderSide; count: number }[];
  /** Element tags using this width, most-used first. */
  tags: AuditTagUsage[];
}

/** Motion tokens: the timing and the curves transitions are built from. */
export interface AuditNumberTagUsage {
  value: number;
  count: number;
  /** Element tags using this value, most-used first. */
  tags: AuditTagUsage[];
}

export interface AuditStringTagUsage {
  value: string;
  count: number;
  /** Element tags using this value, most-used first. */
  tags: AuditTagUsage[];
}

export interface AuditMotion {
  durations: AuditNumberTagUsage[]; // milliseconds
  easings: AuditStringTagUsage[]; // cubic-bezier(...) or keyword
}

export interface SiteAudit {
  rootUrl: string;
  summary: {
    pages: number;
    distinctColours: number;
    colourFamilies: number;
    colourNearDuplicates: number;
    fontFamilies: number;
    typeSizes: number;
    fontWeights: number;
    /** Type sizes off the closest modular scale. */
    typeOffScale?: number;
    spacings: number;
    /** Spacing values off a 4px grid. */
    spacingOffGrid?: number;
    radii: number;
    /** Radius values within ~1px of another. */
    radiusNearDuplicates?: number;
    shadows: number;
    /** Distinct text/background pairs evaluated for contrast. */
    contrastPairs?: number;
    /** Pairs failing WCAG AA for normal text: the accessibility headline. */
    contrastFailingAA?: number;
    // Optional extended categories, present only when extracted.
    borders?: number;
    opacities?: number;
    zIndices?: number;
    blurs?: number;
    breakpoints?: number;
    gradients?: number;
    motions?: number;
  };
  colourFamilies: AuditColourFamily[];
  typography: {
    families: { family: string; count: number }[];
    roles: AuditTypeRole[];
    sizes: AuditTypeSize[];
    weights: number[];
    lineHeights: number[];
    letterSpacings: number[];
  };
  spacing: AuditSpacingUsage[];
  radius: AuditRadiusUsage[];
  shadow: AuditShadowUsage[];
  // ── Extended token categories (all optional for backend compatibility) ─────
  borders?: AuditBorderUsage[]; // border widths, px
  opacity?: AuditNumberTagUsage[]; // 0–1
  zIndex?: AuditNumberTagUsage[]; // stacking values
  blur?: AuditNumberTagUsage[]; // blur radii, px
  breakpoints?: AuditBreakpointUsage[]; // media-query widths, px
  gradients?: AuditStringTagUsage[]; // raw gradient declarations
  motion?: AuditMotion;
  authored?: AuditAuthored; // authored units per category + the site's own custom properties
  contrast?: AuditContrastFinding[]; // text/background pairs with WCAG verdicts, worst first
}

/** A text/background colour pair as shipped, with its WCAG verdict. */
export interface AuditContrastFinding {
  foreground: string;
  background: string;
  ratio: number;
  passAA: boolean;
  passAAA: boolean;
  passAALarge: boolean;
  /** Text elements using this exact pair. */
  count: number;
  sampleTags: string[];
  pages: string[];
}

/** How the site authors its tokens, read from the CSSOM rather than computed px. */
export type CssUnit =
  | "px" | "rem" | "em" | "percent" | "vw" | "vh" | "vmin" | "vmax"
  | "ch" | "ex" | "unitless" | "clamp" | "calc" | "zero" | "other";

export interface AuditAuthoredCategory {
  category: "spacing" | "type" | "radius" | "border";
  units: { unit: CssUnit; count: number }[];
  /**
   * The authored value strings, most-used first, truncated by the service.
   * `valuesDistinct` is how many there were before truncation.
   */
  values: { value: string; count: number }[];
  valuesDistinct: number;
  dominant: CssUnit | null;
  total: number;
}

export interface AuditAuthored {
  categories: AuditAuthoredCategory[];
  customProperties: { name: string; value: string }[];
  /** True when type is dominantly authored in px, which is an accessibility risk. */
  typeInPx: boolean;
}

/** The full deterministic audit for a completed crawl. */
export async function getAudit(jobId: string): Promise<SiteAudit> {
  if (DEMO_MODE) return demoAudit();
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/audit`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as SiteAudit;
}

/** The progress WebSocket lives on the same origin as `/api`, under `/ws`. */
export function progressSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}
