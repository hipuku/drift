/**
 * The Audit — the deterministic "what it is" diagnosis.
 *
 * Aggregates a crawl into an exhaustive inventory: every colour (grouped by
 * family so the near-blacks sit together), every type size/weight/line-height
 * plus the real role→size map read from element tags, and every spacing, radius
 * and shadow value. The summary counts the sprawl. No model — this is the honest
 * picture of what the site actually ships, before any proposal.
 */

import {
  clusterColours,
  collectColourUsage,
  INDISTINGUISHABLE_DELTA_E,
  type ColourElementUsage,
  type ColourRole,
} from "./colours.js";
import { deltaE } from "haus-colour-utils";
import { summariseAuthored, type AuthoredSummary } from "./authored.js";
import { collectContrastFindings, type ContrastFinding } from "./contrast.js";
import { buildScaleToCover, classifyAgainstScale, detectClosestRatio } from "./typeScale.js";
import type { CrawlResult } from "../crawler/types.js";

// ── Colour ───────────────────────────────────────────────────────────────────

export interface ColourSwatch {
  hex: string;
  count: number;
  roles: Record<ColourRole, number>;
  /** Which element types use this colour, in which role. */
  elements: ColourElementUsage[];
  pages: string[];
  /** 0–100 HSL lightness, for sorting within a family. */
  lightness: number;
  /** The perceptually-closest other colour on the site, and the ΔE to it. */
  nearest?: { hex: string; deltaE: number };
  /** Every colour worth relating this one to — opacity variants and near-duplicates. */
  related?: ColourRelation[];
}

export interface ColourRelation {
  hex: string;
  deltaE: number;
  /** Same RGB base as the subject — differs only in alpha. */
  opacityVariant: boolean;
}

export interface ColourFamily {
  /** "Neutral", "Blue", "Red", … */
  name: string;
  swatches: ColourSwatch[];
  /** Summed usage across the family. */
  count: number;
}

// ── Typography ─────────────────────────────────────────────────────────────

export interface FontFamilyUsage {
  family: string;
  count: number;
}

/** The dominant size/weight actually used for a semantic tag (h1, p, …). */
export interface TypeRoleUsage {
  tag: string;
  px: number;
  weight: number | null;
  count: number;
}

export interface TypeSizeTagUsage {
  tag: string;
  count: number;
}

export interface SizeUsage {
  px: number;
  count: number;
  /** All font-weights seen at this size, most-used first. */
  weights: number[];
  /** Element tags that render text at this size, most-used first. */
  tags: TypeSizeTagUsage[];
}

// ── Spacing / radius / shadow ────────────────────────────────────────────────

export interface ValueUsage {
  value: number;
  count: number;
}

export type SpacingProperty = "padding" | "margin" | "gap";

export interface SpacingPropertyUsage {
  property: SpacingProperty;
  count: number;
}

export interface SpacingTagUsage {
  tag: string;
  count: number;
}

export interface SpacingUsage {
  value: number;
  count: number;
  /** Which CSS properties produce this value, most-used first. */
  properties: SpacingPropertyUsage[];
  /** Element tags using this value, most-used first. */
  tags: SpacingTagUsage[];
}

export interface TagUsage {
  tag: string;
  count: number;
}

export interface RadiusUsage {
  value: number;
  count: number;
  /** Element tags using this radius, most-used first. */
  tags?: TagUsage[];
}

export interface ShadowUsage {
  value: string;
  count: number;
  /** Element tags using this shadow, most-used first. */
  tags?: TagUsage[];
}

export type BorderSide = "top" | "right" | "bottom" | "left";

export interface BorderSideUsage {
  side: BorderSide;
  count: number;
}

export interface BorderUsage {
  /** Border width in pixels. */
  value: number;
  count: number;
  /** Which sides carry this width, most-used first. */
  sides?: BorderSideUsage[];
  /** Element tags using this width, most-used first. */
  tags?: TagUsage[];
}

/** A numeric token value with element-tag attribution (opacity, z-index, blur, motion). */
export interface NumberTagUsage {
  value: number;
  count: number;
  tags?: TagUsage[];
}

/** A string token value with element-tag attribution (gradient, easing). */
export interface StringTagUsage {
  value: string;
  count: number;
  tags?: TagUsage[];
}

export interface MotionUsage {
  durations: NumberTagUsage[];
  easings: StringTagUsage[];
}

export interface BreakpointTypeUsage {
  type: "min" | "max";
  count: number;
}

export interface BreakpointUsage {
  /** Breakpoint width in pixels. */
  value: number;
  count: number;
  /** min-width vs max-width split, most-used first. */
  types?: BreakpointTypeUsage[];
}

// ── The whole audit ──────────────────────────────────────────────────────────

export interface AuditSummary {
  pages: number;
  distinctColours: number;
  colourFamilies: number;
  /** Colours indistinguishable from another (ΔE < ~2) — genuine redundancy. */
  colourNearDuplicates: number;
  fontFamilies: number;
  typeSizes: number;
  fontWeights: number;
  /** Type sizes that fall off the closest modular scale. */
  typeOffScale: number;
  spacings: number;
  /** Spacing values off a 4px grid. */
  spacingOffGrid: number;
  radii: number;
  /** Radius values within ~1px of another (accidental near-duplicates). */
  radiusNearDuplicates: number;
  shadows: number;
  /** Distinct text/background pairs evaluated for contrast. */
  contrastPairs: number;
  /** Pairs failing WCAG AA for normal-size text — the accessibility headline. */
  contrastFailingAA: number;
}

export interface SiteAudit {
  rootUrl: string;
  summary: AuditSummary;
  colourFamilies: ColourFamily[];
  typography: {
    families: FontFamilyUsage[];
    roles: TypeRoleUsage[];
    sizes: SizeUsage[];
    weights: number[];
    lineHeights: number[];
    letterSpacings: number[];
  };
  spacing: SpacingUsage[];
  radius: RadiusUsage[];
  shadow: ShadowUsage[];
  borders?: BorderUsage[];
  opacity?: NumberTagUsage[];
  zIndex?: NumberTagUsage[];
  blur?: NumberTagUsage[];
  gradients?: StringTagUsage[];
  motion?: MotionUsage;
  breakpoints?: BreakpointUsage[];
  /** How the site authors its tokens (units per category) + its own custom properties. */
  authored?: AuthoredSummary;
  /** Text/background pairs with their WCAG contrast verdict, worst first. */
  contrast?: ContrastFinding[];
}

// ── Colour family classification ─────────────────────────────────────────────

interface Hsl {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

/** Parse #rgb / #rrggbb / #rrggbbaa (alpha ignored) to HSL. Null if unparseable. */
function hexToHsl(hex: string): Hsl | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
  }
  return { h: hue, s, l };
}

const HUE_BUCKETS: { name: string; max: number }[] = [
  { name: "Red", max: 15 },
  { name: "Orange", max: 45 },
  { name: "Yellow", max: 70 },
  { name: "Green", max: 160 },
  { name: "Teal", max: 200 },
  { name: "Blue", max: 260 },
  { name: "Purple", max: 290 },
  { name: "Pink", max: 345 },
];

/** Low-chroma colours are neutrals; otherwise bucket by hue. */
function familyName(hsl: Hsl): string {
  if (hsl.s < 0.12) return "Neutral";
  for (const bucket of HUE_BUCKETS) {
    if (hsl.h < bucket.max) return bucket.name;
  }
  return "Red"; // wraps past 345°
}

function groupColoursByFamily(result: CrawlResult): ColourFamily[] {
  const families = new Map<string, ColourSwatch[]>();

  for (const u of collectColourUsage(result)) {
    const hsl = hexToHsl(u.hex);
    if (!hsl) continue;
    const name = familyName(hsl);
    const swatch: ColourSwatch = {
      hex: u.hex,
      count: u.count,
      roles: u.roles,
      elements: u.elements,
      pages: [...u.pages].sort(),
      lightness: Math.round(hsl.l * 100),
    };
    const list = families.get(name);
    if (list) list.push(swatch);
    else families.set(name, [swatch]);
  }

  return [...families.entries()]
    .map(([name, swatches]) => ({
      name,
      // Light → dark within a family, so shades read as a ramp.
      swatches: swatches.sort((a, b) => b.lightness - a.lightness || compareHex(a.hex, b.hex)),
      count: swatches.reduce((n, s) => n + s.count, 0),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── Typography aggregation ───────────────────────────────────────────────────

const ROLE_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "a", "small", "label", "blockquote", "li"]);

/**
 * Total order on hex values, used as the last key in every sort below. A Map
 * iterates in insertion order, so without it the audit reflects the order the
 * crawler happened to visit pages in, and two runs over an unchanged site can
 * differ. Diffing two runs is the product, so every list it emits is ordered by
 * the data alone.
 */
function compareHex(a: string, b: string): number {
  return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
}

function mode(counts: Map<number, number>): number | undefined {
  let best: number | undefined;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN || (n === bestN && best !== undefined && k < best)) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

interface RoleTally {
  sizes: Map<number, number>;
  weights: Map<number, number>;
  count: number;
}

interface SizeTally {
  count: number;
  weights: Map<number, number>;
  tags: Map<string, number>;
}

function collectTypography(result: CrawlResult): SiteAudit["typography"] {
  const families = new Map<string, number>();
  const sizes = new Map<number, SizeTally>();
  const weights = new Set<number>();
  const lineHeights = new Set<number>();
  const letterSpacings = new Set<number>();
  const roles = new Map<string, RoleTally>();

  for (const page of result.pages) {
    for (const el of page.elements) {
      if (!el.hasText) continue;
      const s = el.styles;
      if (s.fontFamily) families.set(s.fontFamily, (families.get(s.fontFamily) ?? 0) + 1);
      if (s.fontSize != null) {
        const px = Math.round(s.fontSize * 10) / 10;
        let sz = sizes.get(px);
        if (!sz) {
          sz = { count: 0, weights: new Map(), tags: new Map() };
          sizes.set(px, sz);
        }
        sz.count += 1;
        if (s.fontWeight != null) sz.weights.set(s.fontWeight, (sz.weights.get(s.fontWeight) ?? 0) + 1);
        sz.tags.set(el.tag, (sz.tags.get(el.tag) ?? 0) + 1);
      }
      if (s.fontWeight != null) weights.add(s.fontWeight);
      if (s.lineHeight != null) lineHeights.add(Math.round(s.lineHeight * 100) / 100);
      if (s.letterSpacing) letterSpacings.add(Math.round(s.letterSpacing * 1000) / 1000);

      if (ROLE_TAGS.has(el.tag) && s.fontSize != null) {
        let tally = roles.get(el.tag);
        if (!tally) {
          tally = { sizes: new Map(), weights: new Map(), count: 0 };
          roles.set(el.tag, tally);
        }
        const px = Math.round(s.fontSize * 10) / 10;
        tally.sizes.set(px, (tally.sizes.get(px) ?? 0) + 1);
        if (s.fontWeight != null) tally.weights.set(s.fontWeight, (tally.weights.get(s.fontWeight) ?? 0) + 1);
        tally.count += 1;
      }
    }
  }

  const roleList: TypeRoleUsage[] = [...roles.entries()]
    .map(([tag, t]) => ({ tag, px: mode(t.sizes) ?? 0, weight: mode(t.weights) ?? null, count: t.count }))
    .sort((a, b) => b.px - a.px || a.tag.localeCompare(b.tag));

  return {
    families: [...families.entries()]
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    roles: roleList,
    sizes: [...sizes.entries()]
      .map(([px, s]) => ({
        px,
        count: s.count,
        weights: [...s.weights.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([w]) => w),
        tags: [...s.tags.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      }))
      .sort((a, b) => a.px - b.px),
    weights: [...weights].sort((a, b) => a - b),
    lineHeights: [...lineHeights].sort((a, b) => a - b),
    letterSpacings: [...letterSpacings].sort((a, b) => a - b),
  };
}

// ── Spacing / radius / shadow ────────────────────────────────────────────────

/**
 * Minimum px for a value to count as a real design token. Sub-pixel values are
 * browser rounding of rem/em/percent (e.g. 0.4375px) — noise, not tokens.
 */
const MIN_TOKEN_PX = 1;

/**
 * Quantise a resolved px value before it becomes a token key. A single authored
 * value (e.g. `0.125rem`) resolves to sub-pixel-different pixels across contexts
 * (`1.96195` vs `1.96209`), which would otherwise surface as separate tokens.
 * Rounding to 2 dp merges those resolution artifacts without conflating values
 * that genuinely differ (real tokens differ by ≥1px). It does *not* clean up the
 * fractional value itself — that needs the authored unit (read from the CSSOM).
 */
function quantize(px: number): number {
  return Math.round(px * 100) / 100;
}

interface SpacingTally {
  count: number;
  properties: Map<SpacingProperty, number>;
  tags: Map<string, number>;
}

function collectSpacing(result: CrawlResult): SpacingUsage[] {
  const values = new Map<number, SpacingTally>();
  const record = (raw: number, property: SpacingProperty, tag: string) => {
    const v = quantize(raw);
    if (v < MIN_TOKEN_PX) return;
    let t = values.get(v);
    if (!t) {
      t = { count: 0, properties: new Map(), tags: new Map() };
      values.set(v, t);
    }
    t.count += 1;
    t.properties.set(property, (t.properties.get(property) ?? 0) + 1);
    t.tags.set(tag, (t.tags.get(tag) ?? 0) + 1);
  };

  for (const page of result.pages) {
    for (const el of page.elements) {
      for (const v of el.styles.padding) record(v, "padding", el.tag);
      for (const v of el.styles.margin ?? []) record(v, "margin", el.tag);
      for (const v of el.styles.gap ?? []) record(v, "gap", el.tag);
    }
  }

  return [...values.entries()]
    .map(([value, t]) => ({
      value,
      count: t.count,
      properties: [...t.properties.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([property, count]) => ({ property, count })),
      tags: tagList(t.tags),
    }))
    .sort((a, b) => a.value - b.value);
}

/** Sort a tag→count map into a most-used-first list. */
function tagList(tags: Map<string, number>): TagUsage[] {
  return [...tags.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

function collectRadius(result: CrawlResult): RadiusUsage[] {
  const tally = new Map<number, { count: number; tags: Map<string, number> }>();
  for (const page of result.pages) {
    for (const el of page.elements) {
      for (const raw of el.styles.borderRadius) {
        const v = quantize(raw);
        if (v < MIN_TOKEN_PX) continue;
        let t = tally.get(v);
        if (!t) {
          t = { count: 0, tags: new Map() };
          tally.set(v, t);
        }
        t.count += 1;
        t.tags.set(el.tag, (t.tags.get(el.tag) ?? 0) + 1);
      }
    }
  }
  return [...tally.entries()]
    .map(([value, t]) => ({ value, count: t.count, tags: tagList(t.tags) }))
    .sort((a, b) => a.value - b.value);
}

function collectShadow(result: CrawlResult): ShadowUsage[] {
  const tally = new Map<string, { count: number; tags: Map<string, number> }>();
  for (const page of result.pages) {
    for (const el of page.elements) {
      const sh = el.styles.boxShadow;
      if (!sh) continue;
      let t = tally.get(sh);
      if (!t) {
        t = { count: 0, tags: new Map() };
        tally.set(sh, t);
      }
      t.count += 1;
      t.tags.set(el.tag, (t.tags.get(el.tag) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([value, t]) => ({ value, count: t.count, tags: tagList(t.tags) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const BORDER_SIDES: BorderSide[] = ["top", "right", "bottom", "left"];

function collectBorders(result: CrawlResult): BorderUsage[] {
  const tally = new Map<number, { count: number; sides: Map<BorderSide, number>; tags: Map<string, number> }>();
  for (const page of result.pages) {
    for (const el of page.elements) {
      const widths = el.styles.borderWidths;
      if (!widths) continue;
      widths.forEach((raw, i) => {
        const w = quantize(raw);
        if (w < MIN_TOKEN_PX) return;
        let t = tally.get(w);
        if (!t) {
          t = { count: 0, sides: new Map(), tags: new Map() };
          tally.set(w, t);
        }
        t.count += 1;
        const side = BORDER_SIDES[i]!;
        t.sides.set(side, (t.sides.get(side) ?? 0) + 1);
        t.tags.set(el.tag, (t.tags.get(el.tag) ?? 0) + 1);
      });
    }
  }
  return [...tally.entries()]
    .map(([value, t]) => ({
      value,
      count: t.count,
      sides: [...t.sides.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([side, count]) => ({ side, count })),
      tags: tagList(t.tags),
    }))
    .sort((a, b) => a.value - b.value);
}

/** Tally distinct token values across all elements, with per-value tag attribution. */
function tallyTagged<K>(
  result: CrawlResult,
  values: (el: CrawlResult["pages"][number]["elements"][number]) => K[],
): Map<K, { count: number; tags: Map<string, number> }> {
  const tally = new Map<K, { count: number; tags: Map<string, number> }>();
  for (const page of result.pages) {
    for (const el of page.elements) {
      for (const v of values(el)) {
        let t = tally.get(v);
        if (!t) {
          t = { count: 0, tags: new Map() };
          tally.set(v, t);
        }
        t.count += 1;
        t.tags.set(el.tag, (t.tags.get(el.tag) ?? 0) + 1);
      }
    }
  }
  return tally;
}

const numberTagList = (tally: Map<number, { count: number; tags: Map<string, number> }>): NumberTagUsage[] =>
  [...tally.entries()].map(([value, t]) => ({ value, count: t.count, tags: tagList(t.tags) }));

const stringTagList = (tally: Map<string, { count: number; tags: Map<string, number> }>): StringTagUsage[] =>
  [...tally.entries()].map(([value, t]) => ({ value, count: t.count, tags: tagList(t.tags) }));

function collectOpacity(result: CrawlResult): NumberTagUsage[] {
  const tally = tallyTagged(result, (el) => {
    const o = el.styles.opacity;
    return o != null && o >= 0 && o < 1 ? [Math.round(o * 100) / 100] : [];
  });
  return numberTagList(tally).sort((a, b) => b.value - a.value);
}

function collectZIndex(result: CrawlResult): NumberTagUsage[] {
  const tally = tallyTagged(result, (el) => (el.styles.zIndex != null ? [el.styles.zIndex] : []));
  return numberTagList(tally).sort((a, b) => a.value - b.value);
}

function collectBlur(result: CrawlResult): NumberTagUsage[] {
  const tally = tallyTagged(result, (el) => el.styles.blur ?? []);
  return numberTagList(tally).sort((a, b) => a.value - b.value);
}

function collectGradients(result: CrawlResult): StringTagUsage[] {
  const tally = tallyTagged(result, (el) => (el.styles.gradient ? [el.styles.gradient] : []));
  return stringTagList(tally).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function collectBreakpoints(result: CrawlResult): BreakpointUsage[] {
  const tally = new Map<number, { count: number; types: Map<"min" | "max", number> }>();
  for (const page of result.pages) {
    for (const bp of page.breakpoints ?? []) {
      let t = tally.get(bp.value);
      if (!t) {
        t = { count: 0, types: new Map() };
        tally.set(bp.value, t);
      }
      t.count += 1;
      t.types.set(bp.type, (t.types.get(bp.type) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([value, t]) => ({
      value,
      count: t.count,
      types: [...t.types.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([type, count]) => ({ type, count })),
    }))
    .sort((a, b) => a.value - b.value);
}

function collectMotion(result: CrawlResult): MotionUsage {
  const durations = numberTagList(tallyTagged(result, (el) => el.styles.motionDurations ?? [])).sort(
    (a, b) => a.value - b.value,
  );
  const easings = stringTagList(tallyTagged(result, (el) => el.styles.motionEasings ?? [])).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
  return { durations, easings };
}

/** Nearest other colour by CIEDE2000 ΔE (alpha ignored). Undefined if alone. */
function nearestColour(hex: string, all: string[]): ColourSwatch["nearest"] {
  const a = hex.slice(0, 7);
  let best: { hex: string; deltaE: number } | undefined;
  for (const other of all) {
    if (other === hex) continue;
    let d: number;
    try {
      d = deltaE(a, other.slice(0, 7));
    } catch {
      continue;
    }
    if (!Number.isFinite(d)) continue;
    if (!best || d < best.deltaE || (d === best.deltaE && compareHex(other, best.hex) < 0)) {
      best = { hex: other, deltaE: d };
    }
  }
  return best ? { hex: best.hex, deltaE: Math.round(best.deltaE * 10) / 10 } : undefined;
}

/** Alpha channel of a hex as a 0–1 fraction; 1 for an opaque #RRGGBB. */
function hexAlpha(hex: string): number {
  return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

/**
 * Every colour worth relating this one to: its opacity variants (same RGB,
 * different alpha) and its perceptual near-duplicates (ΔE under the threshold).
 * ΔE ignores alpha, so opacity variants are found by the hex base, not distance.
 * Ordered opacity-variants-first, then by ascending ΔE.
 */
function relatedColours(hex: string, all: string[]): ColourRelation[] {
  const base = hex.slice(0, 7).toLowerCase();
  const alpha = hexAlpha(hex);
  const rels: ColourRelation[] = [];
  for (const other of all) {
    if (other === hex) continue;
    const opacityVariant = other.slice(0, 7).toLowerCase() === base && hexAlpha(other) !== alpha;
    let d: number;
    try {
      d = deltaE(hex.slice(0, 7), other.slice(0, 7));
    } catch {
      continue;
    }
    if (!Number.isFinite(d)) continue;
    if (opacityVariant || d < INDISTINGUISHABLE_DELTA_E) {
      rels.push({ hex: other, deltaE: Math.round(d * 10) / 10, opacityVariant });
    }
  }
  rels.sort(
    (a, b) =>
      Number(b.opacityVariant) - Number(a.opacityVariant) ||
      a.deltaE - b.deltaE ||
      compareHex(a.hex, b.hex),
  );
  return rels;
}

// ── Redundancy signals — the honest basis for the health verdicts ────────────

const SPACING_GRID_PX = 4;

/** Count values that don't sit on a `base`-px grid (within 0.5px). */
function countOffGrid(values: number[], base = SPACING_GRID_PX): number {
  return values.filter((v) => Math.abs(v - Math.round(v / base) * base) > 0.5).length;
}

/** Count values within `within`px of a neighbour (single-linkage) — accidental near-dupes. */
function countNearDuplicates(values: number[], within = 1): number {
  const sorted = [...values].sort((a, b) => a - b);
  let clusters = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (const v of sorted) {
    if (v - prev > within) clusters += 1;
    prev = v;
  }
  return sorted.length - clusters;
}

/** How many type sizes fall off the closest modular scale (0 when < 2 sizes). */
function countOffScale(typography: SiteAudit["typography"]): number {
  const sizes = typography.sizes.map((s) => s.px);
  if (sizes.length < 2) return 0;
  const base = typography.sizes.reduce((a, b) => (b.count > a.count ? b : a)).px;
  const fit = detectClosestRatio(sizes, base);
  if (!fit) return 0;
  const scale = buildScaleToCover(base, fit.ratio.ratio, Math.min(...sizes), Math.max(...sizes));
  return classifyAgainstScale(sizes, scale).filter((c) => !c.onScale).length;
}

// ── Compose ──────────────────────────────────────────────────────────────────

export function collectAudit(result: CrawlResult): SiteAudit {
  const colourFamilies = groupColoursByFamily(result);
  // Annotate each swatch with its perceptually-closest neighbour across the site.
  const allHexes = colourFamilies.flatMap((f) => f.swatches.map((s) => s.hex));
  for (const fam of colourFamilies) {
    for (const sw of fam.swatches) {
      sw.nearest = nearestColour(sw.hex, allHexes);
      sw.related = relatedColours(sw.hex, allHexes);
    }
  }
  const typography = collectTypography(result);
  const spacing = collectSpacing(result);
  const radius = collectRadius(result);
  const shadow = collectShadow(result);
  const borders = collectBorders(result);
  const opacity = collectOpacity(result);
  const zIndex = collectZIndex(result);
  const blur = collectBlur(result);
  const gradients = collectGradients(result);
  const motion = collectMotion(result);
  const breakpoints = collectBreakpoints(result);
  const authored = summariseAuthored(result.pages);
  const contrast = collectContrastFindings(result);

  const distinctColours = colourFamilies.reduce((n, f) => n + f.swatches.length, 0);
  // Redundancy = colours indistinguishable from another (tight ΔE), so a
  // deliberate tonal ramp is never counted as duplication.
  const clusters = clusterColours(result, INDISTINGUISHABLE_DELTA_E).length;

  return {
    rootUrl: result.rootUrl,
    summary: {
      pages: result.pages.length,
      distinctColours,
      colourFamilies: colourFamilies.length,
      colourNearDuplicates: Math.max(0, distinctColours - clusters),
      fontFamilies: typography.families.length,
      typeSizes: typography.sizes.length,
      fontWeights: typography.weights.length,
      typeOffScale: countOffScale(typography),
      spacings: spacing.length,
      spacingOffGrid: countOffGrid(spacing.map((s) => s.value)),
      radii: radius.length,
      radiusNearDuplicates: countNearDuplicates(radius.map((r) => r.value)),
      shadows: shadow.length,
      contrastPairs: contrast.length,
      contrastFailingAA: contrast.filter((c) => !c.passAA).length,
    },
    colourFamilies,
    typography,
    spacing,
    radius,
    shadow,
    borders,
    opacity,
    zIndex,
    blur,
    gradients,
    motion,
    breakpoints,
    authored:
      authored.categories.length || authored.customProperties.length ? authored : undefined,
    contrast: contrast.length ? contrast : undefined,
  };
}
