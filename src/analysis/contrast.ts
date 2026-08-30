/**
 * Contrast analysis.
 *
 * The standalone form of the work the `check_contrast` step performs: for
 * every element that actually renders text, pair its text colour with the
 * background a reader sees behind it (the effective background resolved during
 * extraction), and evaluate WCAG contrast.
 *
 * WCAG evaluation is delegated to haus-colour-utils (the shared, tested
 * implementation). The value added here is pairing, compositing and
 * aggregation: resolve alpha to the colour a reader actually sees, dedupe to
 * distinct foreground/background pairs, count how many text elements use each,
 * track tags and pages, and surface the worst-contrast pairs first.
 *
 * ## Which background this measures
 *
 * `effectiveBackgroundColor` — what a reader sees behind the text — falling
 * back to the element's own `backgroundColor` when extraction resolved no
 * effective value (a pre-effective crawl, or an element the probe could not
 * walk up from). Contrast is a claim about perception, so an inherited
 * background counts exactly as much as a declared one.
 *
 * `colours.ts` records the authored background instead, because it inventories
 * what a site chose rather than what it renders. The two disagreeing is
 * intended; both rules are asserted in tests so neither drifts into the other.
 */

import { wcagContrast } from "haus-colour-utils";
import type { CrawlResult } from "../crawler/types.js";

export interface ContrastFinding {
  /** Foreground as authored, alpha included. */
  foreground: string;
  /** Background as authored, alpha included. */
  background: string;
  /**
   * The opaque colours the ratio was measured between, present only when
   * compositing changed something. A reader looking at a failing pair needs to
   * see the colour that actually reached the screen.
   */
  resolvedForeground?: string;
  resolvedBackground?: string;
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

/** Alpha of a hex as a 0-1 fraction. 1 for an opaque #rrggbb. */
function alphaOf(hex: string): number {
  return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

/** The three channels of a hex, ignoring any alpha. */
function channels(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, "");
  if (h.length < 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Number.isNaN(r! + g! + b!) ? null : [r!, g!, b!];
}

/**
 * `top` composited over `bottom`, as an opaque #rrggbb.
 *
 * WCAG ratios are defined between two opaque colours. A semi-transparent
 * foreground evaluated as though it were opaque reports the contrast of a colour
 * nobody sees: black at 50% on white measures 18.9 as authored and 3.5 as
 * rendered, which is the difference between passing AAA and failing AA. Muted
 * secondary text is usually written this way, so this is the common case rather
 * than the corner case.
 */
function compositeOver(top: string, bottom: string): string | null {
  const t = channels(top);
  const b = channels(bottom);
  if (!t || !b) return null;

  const alpha = alphaOf(top);
  if (alpha >= 1) return `#${t.map(hex2).join("")}`;

  const mixed = t.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return `#${mixed.map(hex2).join("")}`;
}

const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

/**
 * The page colour a translucent background sits on. The probe walks ancestors
 * until it finds a background with any alpha at all and returns that one
 * uncomposited, so a 50% panel arrives here still translucent, with whatever is
 * behind it already discarded. White is the same default the probe starts from.
 */
const PAGE_BACKGROUND = "#ffffff";

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
      const background = compositeOver(p.background, PAGE_BACKGROUND) ?? p.background;
      const foreground = compositeOver(p.foreground, background) ?? p.foreground;
      const composited =
        foreground !== p.foreground.toLowerCase() || background !== p.background.toLowerCase();

      const c = wcagContrast(foreground, background);
      return {
        foreground: p.foreground,
        background: p.background,
        ...(composited ? { resolvedForeground: foreground, resolvedBackground: background } : {}),
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
