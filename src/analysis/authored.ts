/**
 * Authored-unit analysis.
 *
 * `getComputedStyle` resolves everything to px, discarding the unit the author
 * wrote. The crawler reads the *authored* value strings from the CSSOM instead
 * (see `extractAuthoredDeclarations`); this module classifies those strings by
 * unit and aggregates them per category, so the audit can report how a site
 * actually authors its system — and flag `px` type as an accessibility risk.
 *
 * Pure and Node-side: no DOM, unit-testable without Chromium.
 */

import type { AuthoredCategoryName, PageExtraction } from "../crawler/types.js";

export type CssUnit =
  | "px"
  | "rem"
  | "em"
  | "percent"
  | "vw"
  | "vh"
  | "vmin"
  | "vmax"
  | "ch"
  | "ex"
  | "unitless"
  | "clamp"
  | "calc"
  | "zero"
  | "other";

const UNIT_TOKENS: Record<string, CssUnit> = {
  px: "px",
  rem: "rem",
  em: "em",
  "%": "percent",
  vw: "vw",
  vh: "vh",
  vmin: "vmin",
  vmax: "vmax",
  ch: "ch",
  ex: "ex",
};

// A number followed by an optional unit. Order in the character class doesn't
// matter here because the unit is captured whole by the alternation below.
const NUM_UNIT = /(-?\d*\.?\d+)(px|rem|em|vw|vh|vmin|vmax|ch|ex|%)?/g;

/**
 * Every unit appearing in an authored value string. A fluid/functional value
 * (`clamp`, `calc`, `min`, `max`) is reported as one marker rather than dug into
 * — the signal we want is "this site uses fluid values", not their innards.
 * A bare `0` (`0`, `0px`) is unit-agnostic and reported as `zero` (dropped when
 * tallying). A bare non-zero number (`line-height: 1.5`) is `unitless`.
 */
export function extractUnits(rawValue: string): CssUnit[] {
  const v = rawValue.trim().toLowerCase();
  if (!v) return [];
  if (v.includes("clamp(")) return ["clamp"];
  if (v.includes("calc(") || v.includes("min(") || v.includes("max(")) return ["calc"];
  // A `var(--token)` reference indirects its unit through the custom property —
  // the digits in the token name (`--space-4`) are not a unit. The real unit is
  // read from the custom property's own value instead (see summariseAuthored).
  if (v.includes("var(")) return [];

  const units: CssUnit[] = [];
  NUM_UNIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM_UNIT.exec(v)) !== null) {
    if (m[1] === undefined || m[0] === "") {
      if (NUM_UNIT.lastIndex === m.index) NUM_UNIT.lastIndex++; // guard zero-width
      continue;
    }
    const isZero = parseFloat(m[1]) === 0;
    const unit = m[2];
    if (isZero) units.push("zero");
    else if (!unit) units.push("unitless");
    else units.push(UNIT_TOKENS[unit] ?? "other");
  }
  return units;
}

/** The single dominant unit of a value (its first meaningful token). */
export function classifyUnit(rawValue: string): CssUnit {
  const units = extractUnits(rawValue).filter((u) => u !== "zero");
  return units[0] ?? "other";
}

export interface UnitTally {
  unit: CssUnit;
  count: number;
}

export interface ValueTally {
  /** The authored value string, exactly as it was written in the stylesheet. */
  value: string;
  count: number;
}

/**
 * How many distinct authored values are kept per category. picocss.com writes
 * 183 distinct border values, almost all of them one-offs, and the whole list
 * would be most of the audit payload for no reading. `valuesDistinct` carries
 * the uncapped count so a consumer can say how much of the set it is showing.
 */
export const AUTHORED_VALUES_KEPT = 16;

export interface AuthoredCategory {
  category: AuthoredCategoryName;
  /** Units used to author this category, most-used first. `zero` excluded. */
  units: UnitTally[];
  /**
   * The authored value strings themselves, most-used first, truncated to
   * `AUTHORED_VALUES_KEPT`. The unit tally answers what the site authors in;
   * this answers what it authors. `--space-4 * 2` and `2rem` resolve to the
   * same pixel number and are different authored values.
   */
  values: ValueTally[];
  /** Distinct authored values before truncation. `total` already counts the
   * declarations; this counts how many different strings they used. */
  valuesDistinct: number;
  /** The most-used non-trivial unit, or null when nothing meaningful was found. */
  dominant: CssUnit | null;
  total: number;
}

export interface CustomProperty {
  name: string;
  value: string;
}

export interface AuthoredSummary {
  categories: AuthoredCategory[];
  customProperties: CustomProperty[];
  /**
   * Accessibility flag: type authored in px doesn't scale with the user's font
   * settings / zoom. True when `type` is dominantly px.
   */
  typeInPx: boolean;
}

/** Tally the units across a set of authored value strings for one category. */
function categoryFrom(category: AuthoredCategoryName, values: string[]): AuthoredCategory {
  const counts = new Map<CssUnit, number>();
  const byValue = new Map<string, number>();
  for (const value of values) {
    const units = extractUnits(value);
    for (const u of units) {
      if (u === "zero") continue;
      counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    // Count the value only when it carries a unit the tally kept, so the two
    // sides of the category describe the same set of declarations.
    if (units.some((u) => u !== "zero")) {
      const key = value.trim();
      byValue.set(key, (byValue.get(key) ?? 0) + 1);
    }
  }
  const units = [...counts.entries()]
    .map(([unit, count]) => ({ unit, count }))
    .sort((a, b) => b.count - a.count);
  // Ties break on the value string so a recapture of the same site produces a
  // byte-identical artefact; Map order alone would follow first-seen.
  const ranked = [...byValue.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const total = units.reduce((n, u) => n + u.count, 0);
  return {
    category,
    units,
    values: ranked.slice(0, AUTHORED_VALUES_KEPT),
    valuesDistinct: ranked.length,
    dominant: units[0]?.unit ?? null,
    total,
  };
}

const CATEGORY_ORDER: AuthoredCategoryName[] = ["spacing", "type", "radius", "border"];

/**
 * Map a custom-property name to the category it authors, by prefix. A design
 * system that declares `--space-4: 1rem` is telling us its spacing unit directly
 * — more authoritative than any single usage — so these values feed the tally.
 * Conservative: only unambiguous prefixes; colour/other tokens are ignored.
 */
function categoryForCustomProp(name: string): AuthoredCategoryName | null {
  const n = name.toLowerCase();
  if (/^--(space|spacing|gap|inset|pad)/.test(n)) return "spacing";
  if (/^--(font-size|fontsize|fs|text|type)/.test(n)) return "type";
  if (/^--(radius|rounded|corner)/.test(n)) return "radius";
  if (/^--(border-width|border-w|stroke)/.test(n)) return "border";
  return null;
}

/**
 * Units a declared token contributes to its category's tally. Only real lengths
 * (and fluid values) — so a token that matched a category prefix but holds a
 * colour or a ratio (`--text-primary: oklch(…)`, `--leading: 1.5`) can't pollute
 * the unit signal.
 */
const FOLDABLE: ReadonlySet<CssUnit> = new Set<CssUnit>(["px", "rem", "em", "clamp", "calc"]);
function hasFoldableUnit(value: string): boolean {
  return extractUnits(value).some((u) => FOLDABLE.has(u));
}

/**
 * Aggregate authored declarations + custom properties across every crawled page
 * into one summary. Custom properties are de-duplicated by name (first value
 * wins — they're declared once on :root and repeated per page).
 */
export function summariseAuthored(pages: PageExtraction[]): AuthoredSummary {
  const valuesByCategory = new Map<AuthoredCategoryName, string[]>();
  const push = (c: AuthoredCategoryName, value: string) => {
    const list = valuesByCategory.get(c) ?? [];
    list.push(value);
    valuesByCategory.set(c, list);
  };
  const customProps = new Map<string, string>();

  for (const page of pages) {
    const a = page.authored;
    if (!a) continue;
    for (const d of a.declarations) push(d.category, d.value);
    for (const p of a.customProperties) {
      if (!customProps.has(p.name)) customProps.set(p.name, p.value);
    }
  }

  // A declared token (`--space-4: 1rem`) is the site stating its unit directly.
  for (const [name, value] of customProps) {
    const c = categoryForCustomProp(name);
    if (c && hasFoldableUnit(value)) push(c, value);
  }

  const categories = CATEGORY_ORDER.map((c) => categoryFrom(c, valuesByCategory.get(c) ?? [])).filter(
    (c) => c.total > 0,
  );

  const type = categories.find((c) => c.category === "type");
  const typeInPx = type?.dominant === "px";

  const customProperties = [...customProps.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { categories, customProperties, typeInPx };
}
