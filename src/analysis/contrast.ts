/**
 * Contrast analysis.
 *
 * The standalone form of the work the `check_contrast` step performs: for
 * every element that actually renders text, pair its text colour with the
 * background a reader sees behind it (the effective background resolved during
 * extraction), and evaluate WCAG contrast.
 *
 * WCAG evaluation is delegated to haus-colour-utils (the shared, tested
 * implementation). The value added here is pairing and aggregation: dedupe to
 * distinct foreground/background pairs, count how many text elements use each,
 * track tags and pages, and surface the worst-contrast pairs first.
 */

import { wcagContrast } from "haus-colour-utils";
import type { CrawlResult } from "../crawler/types.js";

export interface ContrastFinding {
  foreground: string;
  background: string;
  ratio: number;
  passAA: boolean;
  passAAA: boolean;
  passAALarge: boolean;
  /** Number of text elements using this exact foreground/background pair. */
  count: number;
  /** Distinct element tags exhibiting this pair. */
  sampleTags: string[];
  /** Distinct pages this pair appears on. */
  pages: string[];
}

interface MutablePair {
  foreground: string;
  background: string;
  count: number;
  tags: Set<string>;
  pages: Set<string>;
}

/**
 * Evaluate text/background contrast across the extraction.
 * Returns one finding per distinct foreground/background pair, sorted by
 * ratio ascending so the worst (most likely to fail) appear first.
 */
export function collectContrastFindings(result: CrawlResult): ContrastFinding[] {
  const pairs = new Map<string, MutablePair>();

  for (const page of result.pages) {
    for (const el of page.elements) {
      if (!el.hasText) continue;

      const fg = el.styles.color;
      const bg = el.styles.effectiveBackgroundColor ?? el.styles.backgroundColor;
      if (!fg || !bg) continue;

      const key = `${fg}|${bg}`;
      let pair = pairs.get(key);
      if (!pair) {
        pair = { foreground: fg, background: bg, count: 0, tags: new Set(), pages: new Set() };
        pairs.set(key, pair);
      }
      pair.count += 1;
      pair.tags.add(el.tag);
      pair.pages.add(page.url);
    }
  }

  return [...pairs.values()]
    .map((p) => {
      const c = wcagContrast(p.foreground, p.background);
      return {
        foreground: p.foreground,
        background: p.background,
        ratio: c.ratio,
        passAA: c.passAA,
        passAAA: c.passAAA,
        passAALarge: c.passAALarge,
        count: p.count,
        sampleTags: [...p.tags].sort(),
        pages: [...p.pages].sort(),
      };
    })
    .sort(
      (a, b) =>
        a.ratio - b.ratio ||
        (a.foreground < b.foreground ? -1 : a.foreground > b.foreground ? 1 : 0) ||
        (a.background < b.background ? -1 : a.background > b.background ? 1 : 0),
    );
}
