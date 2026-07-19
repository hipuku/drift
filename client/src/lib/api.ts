/**
 * The backend contract, client side.
 *
 * Mirrors the server's request/response shapes (src/agent/types.ts,
 * src/queue/crawlQueue.ts) and wraps every call to the `/api` proxy in a thin
 * helper that surfaces the server's friendly `error` string. Kept in one place
 * so the screens fetch through typed functions, never raw URLs.
 */

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

export interface ReviewItem {
  id: string;
  summary: string;
}

export type JudgmentDecision = "intentional_variant" | "consolidation_target";

export interface Judgment {
  id: string;
  decision: JudgmentDecision;
}

export interface ReportFinding {
  severity: "low" | "medium" | "high";
  area: "colour" | "contrast" | "spacing" | "typography" | "shadow" | "other";
  description: string;
  recommendation: string;
}

export interface AuditReport {
  healthScore: number;
  summary: string;
  findings: ReportFinding[];
  consolidationOpportunities: string[];
}

/** The deterministic typography inventory (mirrors src/analysis/typography.ts). */
export interface TypographyInventory {
  families: { family: string; count: number; pages: string[] }[];
  sizes: { px: number; count: number; weights: number[]; lineHeights: number[]; pages: string[] }[];
  baseSizePx: number | null;
  primaryFamily: string | null;
}

/**
 * What `/audit` and `/audit/:id/resume` return. The server's checkpoint outcome
 * also carries the serialised agent state; the client only needs the question
 * and items, so the extra fields are intentionally not modelled here.
 */
export type AgentOutcome =
  | { status: "checkpoint"; question: string; items: ReviewItem[] }
  | { status: "report"; report: AuditReport; findings?: unknown }
  | { status: "aborted"; reason: string };

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
  return postJson("/crawl", { url, pages, maxPages: pages.length });
}

export interface CrawlStatus {
  status: string; // queued | active | completed | failed | not_found | …
  result: CrawlResultMeta | null;
}

/** Poll the crawl's status/result. Authoritative source of crawl completion. */
export async function getCrawlStatus(jobId: string): Promise<CrawlStatus> {
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/result`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as CrawlStatus;
}

/** The typography inventory for a completed crawl — seeds the type proposals. */
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

/** The colour inventory for a completed crawl — seeds the consolidation proposal. */
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
  elements?: AuditColourElementUsage[];
  pages: string[];
  lightness: number;
  /** The perceptually-closest other colour on the site, and the ΔE to it. */
  nearest?: { hex: string; deltaE: number };
  /** Every colour worth relating this one to — opacity variants and near-duplicates. */
  related?: AuditColourRelation[];
}

export interface AuditColourRelation {
  hex: string;
  deltaE: number;
  /** Same RGB base as the subject — differs only in alpha. */
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

export interface AuditValueUsage {
  value: number;
  count: number;
}

/** A token whose value is a CSS string (shadow, gradient, easing, …). */
export interface AuditStringUsage {
  value: string;
  count: number;
}

/** Motion tokens — the timing and the curves transitions are built from. */
export interface AuditMotion {
  durations: AuditValueUsage[]; // milliseconds
  easings: AuditStringUsage[]; // cubic-bezier(...) or keyword
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
    // Optional extended categories — present only when extracted.
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
    sizes: { px: number; count: number }[];
    weights: number[];
    lineHeights: number[];
    letterSpacings: number[];
  };
  spacing: AuditValueUsage[];
  radius: AuditValueUsage[];
  shadow: AuditStringUsage[];
  // ── Extended token categories (all optional for backend compatibility) ─────
  borders?: AuditValueUsage[]; // border widths, px
  opacity?: AuditValueUsage[]; // 0–1
  zIndex?: AuditValueUsage[]; // stacking values
  blur?: AuditValueUsage[]; // blur radii, px
  breakpoints?: AuditValueUsage[]; // media-query widths, px
  gradients?: AuditStringUsage[]; // raw gradient declarations
  motion?: AuditMotion;
}

/** The full deterministic audit for a completed crawl. */
export async function getAudit(jobId: string): Promise<SiteAudit> {
  const res = await fetch(`/api/crawl/${encodeURIComponent(jobId)}/audit`);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as SiteAudit;
}

/** Run the audit for a completed crawl. May pause for human review. */
export function startAudit(jobId: string): Promise<AgentOutcome> {
  return postJson(`/audit/${encodeURIComponent(jobId)}`, {});
}

/** Resume a paused audit with the human's judgments. */
export function resumeAudit(jobId: string, judgments: Judgment[]): Promise<AgentOutcome> {
  return postJson(`/audit/${encodeURIComponent(jobId)}/resume`, { judgments });
}

/** The progress WebSocket lives on the same origin as `/api`, under `/ws`. */
export function progressSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}
