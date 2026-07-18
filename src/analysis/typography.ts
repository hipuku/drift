/**
 * Typography aggregation — the deterministic Inventory for type.
 *
 * Walks the extraction and tallies what's actually *seen*: only elements with
 * direct rendered text count, so inherited font properties on layout wrappers
 * don't inflate the numbers. Produces the distinct font families and the size
 * ladder (each size with the weights and line-heights it appears at), plus the
 * detected base size — the most common text size, a reliable proxy for body —
 * which seeds the type-scale proposals.
 */

import type { CrawlResult } from "../crawler/types.js";

export interface FontFamilyUsage {
  family: string;
  count: number;
  pages: string[];
}

export interface FontSizeUsage {
  /** Pixels, rounded to one decimal to fold float noise. */
  px: number;
  count: number;
  /** Distinct numeric weights this size appears at, ascending. */
  weights: number[];
  /** Distinct unitless line-heights this size appears at, ascending. */
  lineHeights: number[];
  pages: string[];
}

export interface TypographyInventory {
  families: FontFamilyUsage[]; // most-used first
  sizes: FontSizeUsage[]; // smallest first
  /** Most common text size — the body base that seeds the scale proposals. */
  baseSizePx: number | null;
  /** Most-used family. */
  primaryFamily: string | null;
}

interface MutableFamily {
  family: string;
  count: number;
  pages: Set<string>;
}

interface MutableSize {
  px: number;
  count: number;
  weights: Set<number>;
  lineHeights: Set<number>;
  pages: Set<string>;
}

const roundPx = (px: number): number => Math.round(px * 10) / 10;

export function collectTypography(result: CrawlResult): TypographyInventory {
  const families = new Map<string, MutableFamily>();
  const sizes = new Map<number, MutableSize>();

  for (const page of result.pages) {
    for (const el of page.elements) {
      // Only count elements that actually render text — that's where type is seen.
      if (!el.hasText) continue;
      const s = el.styles;

      if (s.fontFamily) {
        const key = s.fontFamily.toLowerCase();
        let fam = families.get(key);
        if (!fam) {
          fam = { family: s.fontFamily, count: 0, pages: new Set() };
          families.set(key, fam);
        }
        fam.count += 1;
        fam.pages.add(page.url);
      }

      if (s.fontSize != null) {
        const px = roundPx(s.fontSize);
        let size = sizes.get(px);
        if (!size) {
          size = { px, count: 0, weights: new Set(), lineHeights: new Set(), pages: new Set() };
          sizes.set(px, size);
        }
        size.count += 1;
        if (s.fontWeight != null) size.weights.add(s.fontWeight);
        if (s.lineHeight != null) size.lineHeights.add(Math.round(s.lineHeight * 100) / 100);
        size.pages.add(page.url);
      }
    }
  }

  const familyList = [...families.values()]
    .map((f) => ({ family: f.family, count: f.count, pages: [...f.pages] }))
    .sort((a, b) => b.count - a.count);

  const sizeList = [...sizes.values()]
    .map((s) => ({
      px: s.px,
      count: s.count,
      weights: [...s.weights].sort((a, b) => a - b),
      lineHeights: [...s.lineHeights].sort((a, b) => a - b),
      pages: [...s.pages],
    }))
    .sort((a, b) => a.px - b.px);

  // Base = the single most common text size (body text dominates the counts).
  const baseSizePx = sizeList.length
    ? sizeList.reduce((a, b) => (b.count > a.count ? b : a)).px
    : null;

  return {
    families: familyList,
    sizes: sizeList,
    baseSizePx,
    primaryFamily: familyList[0]?.family ?? null,
  };
}
