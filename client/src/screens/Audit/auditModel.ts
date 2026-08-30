/**
 * The audit screen's pure model: prose, units, colour relationships, verdicts.
 *
 * Split out of Audit.tsx, which had grown past 1800 lines with this logic
 * interleaved between components. Nothing here touches React or the DOM, so it
 * can be reasoned about and tested directly rather than through a rendered
 * screen. Audit.tsx keeps the rendering; this keeps the decisions.
 */

import type { AuditAuthored, CssUnit, SiteAudit } from "../../lib/api.js";

// ── Thresholds ──────────────────────────────────────────────────────────────

/**
 * ΔE below which two colours are effectively identical.
 *
 * Mirrors `INDISTINGUISHABLE_DELTA_E` in the service's `analysis/colours.ts`.
 * The two are held in step by `lib/contract.test.ts`, move one and that test
 * fails. Do not change this without changing the service.
 */
export const INDISTINGUISHABLE_DELTA_E = 2;

/** ΔE above which the nearest colour is too far apart to be worth surfacing. */
export const NEAREST_DELTA_E = 5;

/** Beyond this the tag chips stop informing and start pushing the row taller. */
export const MAX_TAG_CHIPS = 8;

const REM_BASE = 16;

export type Verdict = "good" | "watch" | "review" | "neutral" | "empty";

/** Which unit leads a scalar value. Both are always shown; this picks the primary. */
export type DisplayUnit = "px" | "rem";

export type NearKind = "opacity" | "duplicate" | "nearest";

/** Which tab an overview verdict card links to. */
export const VERDICT_TAB: Record<string, string> = {
  Colours: "colour",
  Type: "type",
  Spacing: "spacing",
  Radius: "radius",
  Shadows: "shadow",
  Border: "border",
  Opacity: "opacity",
  "Z-index": "zindex",
  Blur: "blur",
  Breakpoints: "breakpoint",
  Gradient: "gradient",
  Motion: "motion",
};

// ── Text ────────────────────────────────────────────────────────────────────

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/** Oxford-comma join: ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b, and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The diagnosis line, where the system is drifting, in plain terms. Names every
 * token category present: those with redundancy get a "N of M …" problem clause,
 * the rest are gathered as holding steady. Reads as prose, not a census.
 */
export function healthLine(s: SiteAudit["summary"], extendedDrift: string[] = []): string {
  const problems: string[] = [];
  const clean: string[] = [];

  const colourDup = s.colourNearDuplicates ?? 0;
  if (colourDup > 0)
    problems.push(`${colourDup} of ${s.distinctColours} colours are near-duplicates`);
  else clean.push("colour");

  const offScale = s.typeOffScale ?? 0;
  if (offScale > 0) problems.push(`${offScale} of ${s.typeSizes} type sizes fall off the scale`);
  else clean.push("type");

  const offGrid = s.spacingOffGrid ?? 0;
  if (offGrid > 0) problems.push(`${offGrid} of ${s.spacings} spacing values miss the 4px grid`);
  else clean.push("spacing");

  const radiusDup = s.radiusNearDuplicates ?? 0;
  if (s.radii > 0) {
    if (radiusDup > 0) problems.push(`${radiusDup} of ${s.radii} radii nearly repeat`);
    else clean.push("radius");
  }
  if (s.shadows > 0) clean.push("shadows"); // no redundancy signal, treated as holding

  // Contrast is the one finding with a user-facing consequence, so it leads the
  // problem list rather than joining the sprawl counts.
  const failingAA = s.contrastFailingAA ?? 0;
  if ((s.contrastPairs ?? 0) > 0) {
    if (failingAA > 0)
      problems.unshift(`${failingAA} of ${s.contrastPairs} text/background pairs fail WCAG AA`);
    else clean.push("contrast");
  }

  const tail = extendedDrift.length ? ` Also drifting: ${joinList(extendedDrift)}.` : "";

  if (problems.length === 0) {
    return `Nothing's drifting. ${capFirst(joinList(clean))} all hold to a system.${tail}`;
  }
  const problemText = `${capFirst(joinList(problems))}.`;
  if (clean.length === 0) return `${problemText}${tail}`;
  return `${problemText} ${capFirst(joinList(clean))} ${plural(clean.length, "holds", "hold")} steady.${tail}`;
}

// ── Colour ──────────────────────────────────────────────────────────────────

/** Stable DOM id for a colour card, so picking a neighbour can scroll it into view. */
export function cardId(hex: string): string {
  return `swatch-${hex.replace(/[^a-z0-9]/gi, "")}`;
}

/** Alpha channel of an 8-digit hex as a 0–1 fraction; 1 for an opaque #RRGGBB. */
export function alphaOf(hex: string): number {
  return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

/** Two colours share an RGB base, they differ, if at all, only in alpha. */
export function sameBaseColour(a: string, b: string): boolean {
  return a.slice(0, 7).toLowerCase() === b.slice(0, 7).toLowerCase();
}

/**
 * How a colour relates to its nearest neighbour. ΔE ignores alpha, so a colour
 * and its translucent self read as ΔE 0, that's an *opacity* variant, not a
 * perceptual duplicate. Only genuinely different hues under the threshold are
 * "duplicate"; everything else is just the nearest.
 */
export function nearKind(hex: string, near: { hex: string; deltaE: number }): NearKind {
  if (sameBaseColour(hex, near.hex) && alphaOf(hex) !== alphaOf(near.hex)) return "opacity";
  return near.deltaE < INDISTINGUISHABLE_DELTA_E ? "duplicate" : "nearest";
}

/**
 * Whether a custom-property value is a concrete colour we can render as a swatch.
 * Skips var()/calc() forms. They can't resolve in this document, so they'd paint
 * an empty box.
 */
export function colourish(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.includes("var(") || v.includes("calc(")) return false;
  return /^(#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\()/.test(v);
}

// ── Verdicts and usage ──────────────────────────────────────────────────────

/** Graduated verdict from a redundancy count: none = good, a few = watch, more = review. */
export function redundancyVerdict(n: number): Verdict {
  return n === 0 ? "good" : n <= 2 ? "watch" : "review";
}

export function usageChips(count: number, totalPages: number, tokenPages?: number): string[] {
  const chips = [`${count.toLocaleString()}× used`];
  if (tokenPages != null && totalPages > 1)
    chips.push(`${tokenPages} ${plural(tokenPages, "page")}`);
  return chips;
}

export function usageText(count: number, totalPages: number, tokenPages?: number): string {
  return usageChips(count, totalPages, tokenPages).join(" · ");
}

// ── Units and scales ────────────────────────────────────────────────────────

/** Display label for a CSS unit. */
const UNIT_LABEL: Partial<Record<CssUnit, string>> = {
  percent: "%",
  unitless: "unitless",
  clamp: "clamp()",
  calc: "calc()",
};

export const unitLabel = (u: CssUnit): string => UNIT_LABEL[u] ?? u;

export const CATEGORY_LABEL: Record<AuditAuthored["categories"][number]["category"], string> = {
  spacing: "Spacing",
  type: "Type",
  radius: "Radius",
  border: "Border",
};

/** px → rem, trailing zeros trimmed. */
export function toRem(px: number): string {
  return `${+(px / REM_BASE).toFixed(4)}rem`;
}

/** A round axis step near `target`: 1, 2, 5 or 10 times a power of ten. */
export function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** Which device band a breakpoint falls in. */
export function deviceClass(px: number): string {
  if (px < 640) return "mobile";
  if (px < 1024) return "tablet";
  return "desktop";
}


// ── Derived sets ────────────────────────────────────────────────────────────
// Pure derivations over an audit. These lived inside the Audit component as
// useMemo bodies, where they could not be tested without rendering a screen,
// and where each one's threshold was a bare number in the middle of JSX.

/**
 * Values within `tolerance` of a smaller value in the same set: the redundancy
 * the audit counts. Only the larger of a pair is returned, because the smaller
 * one is the value the system already had, the later one is the duplicate.
 *
 * Chained near-duplicates are each measured against their immediate
 * predecessor, not against the first of the run: 4 / 4.9 / 5.8 at 1px tolerance
 * is three values that each nearly repeat the one below, and reporting only the
 * middle one would understate it.
 */
export function nearDuplicates(values: number[], tolerance: number): Set<number> {
  const sorted = [...values].sort((a, b) => a - b);
  const set = new Set<number>();
  let prev = Number.NEGATIVE_INFINITY;
  for (const v of sorted) {
    if (v - prev <= tolerance) set.add(v);
    prev = v;
  }
  return set;
}

/** Radii count as redundant within 1px, the audit's own threshold. */
export const RADIUS_NEAR_DUPLICATE_PX = 1;
/** Border widths are finer-grained: 1px vs 1.5px is a real duplicate. */
export const BORDER_NEAR_DUPLICATE_PX = 0.5;

/** Spacing values that miss a grid of `base`, at the audit's 0.5px tolerance. */
export function offGrid(values: number[], base: number): Set<number> {
  const onGrid = (v: number) => Math.abs(v - Math.round(v / base) * base) <= 0.5;
  return new Set(values.filter((v) => !onGrid(v)));
}

/**
 * The grid to measure against when the reader has not chosen one. An 8px grid
 * is a subset of a 4px one, so "nothing misses 8" is the stronger statement and
 * the honest default when it holds. An empty set proves nothing, so it falls to 4.
 */
export function detectGridBase(values: number[]): 4 | 8 {
  return values.length > 0 && offGrid(values, 8).size === 0 ? 8 : 4;
}

/** Position of each z-index in the stacking order, drives the ladder preview. */
export function zIndexRanks(values: number[]): { map: Map<number, number>; total: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const map = new Map<number, number>();
  sorted.forEach((v, i) => map.set(v, i));
  return { map, total: sorted.length };
}

/**
 * The extended tokens with a real drift signal, for the health line: redundant
 * border widths, and a z-index set too large or too ad-hoc to be a scale.
 * A 9999 is the tell for a value picked to win rather than to sit in a scale.
 */
export function extendedDriftAreas(
  borders: { value: number }[] | undefined,
  zIndex: { value: number }[] | undefined,
): string[] {
  const out: string[] = [];
  const widths = (borders ?? []).map((b) => b.value);
  if (nearDuplicates(widths, BORDER_NEAR_DUPLICATE_PX).size > 0) out.push("border widths");
  const zi = zIndex ?? [];
  if (zi.length > 8 || zi.some((z) => Math.abs(z.value) >= 9999)) out.push("z-index");
  return out;
}
