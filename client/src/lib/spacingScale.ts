/**
 * Spacing-grid proposal math. The type scale is geometric (base × ratioⁿ); a
 * spacing scale is linear (multiples of a base unit). Given the ad-hoc spacing
 * values a site uses, detect the base unit it's *closest* to (4 vs 8), build a
 * clean ramp that covers the observed range, and classify each current value as
 * on- or off-grid with the step it would snap to. Pure arithmetic — the Apply
 * interaction re-renders with no round-trip.
 */

/** Candidate base units, in px. Most systems land on one of these. */
export const BASE_UNITS = [4, 8] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/** Distinct spacing value in use, with how often it appears. */
export interface SpaceUsage {
  px: number;
  count: number;
}

export interface GridStep {
  /** Multiple of the base unit, e.g. 3 for 12px on a 4px base. */
  multiple: number;
  name: string;
  px: number;
  rem: number;
}

/**
 * Names follow a numeric spacing token convention (`space-1` = one base unit).
 * Numeric keeps the ramp legible regardless of base and avoids the t-shirt
 * naming trap where the middle of the scale keeps needing new labels.
 */
export function nameForMultiple(multiple: number): string {
  return `space-${multiple}`;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * The ramp for a base unit, covering every observed value. Below 4× we keep
 * every integer multiple (1,2,3,4); above it we thin to the common doubling-ish
 * ramp (6,8,10,12,16,20,24,32,40,48,64…) so the scale stays usable rather than
 * listing 40 steps. Any value that snaps between kept steps still reports its
 * nearest — the ramp is the vocabulary, not a claim that nothing lies between.
 */
export function buildGridToCover(base: BaseUnit, maxPx: number): GridStep[] {
  const cap = Math.max(maxPx, base);
  const multiples = new Set<number>();
  // Dense at the small end where UI spacing actually lives.
  for (let m = 1; m <= 6; m++) multiples.add(m);
  // Thinned ramp above, expressed in px then converted back to base multiples.
  for (const px of [28, 32, 40, 48, 56, 64, 80, 96, 128, 160, 192, 256]) {
    if (px % base === 0) multiples.add(px / base);
  }
  const steps: GridStep[] = [];
  for (const m of [...multiples].sort((a, b) => a - b)) {
    const px = m * base;
    if (px > cap && steps.some((s) => s.px >= cap)) break;
    steps.push({ multiple: m, name: nameForMultiple(m), px, rem: round(px / 16, 4) });
  }
  return steps;
}

export interface BaseFit {
  base: BaseUnit;
  /** Mean relative snap error across the observed values (lower is better). */
  error: number;
  /** How many observed values already sit exactly on this grid. */
  onGrid: number;
}

/** Pick the base unit the site's spacing is already closest to. */
export function detectBaseUnit(values: number[]): BaseFit | null {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return null;

  let best: BaseFit | null = null;
  for (const base of BASE_UNITS) {
    let total = 0;
    let onGrid = 0;
    for (const px of positive) {
      const nearest = Math.max(base, Math.round(px / base) * base);
      total += Math.abs(px - nearest) / px;
      if (Math.abs(px - nearest) < 0.01) onGrid++;
    }
    const fit: BaseFit = { base, error: total / positive.length, onGrid };
    // Prefer lower error; break ties toward the base that lands more values.
    if (!best || fit.error < best.error - 1e-9 || (Math.abs(fit.error - best.error) < 1e-9 && fit.onGrid > best.onGrid)) {
      best = fit;
    }
  }
  return best;
}

export interface SpaceClassification {
  px: number;
  onGrid: boolean;
  nearestPx: number;
  nearestName: string;
}

/**
 * Classify each current value against a built grid. A value is on-grid when it
 * lands within tolerance of a ramp step; otherwise it's flagged with the step
 * it snaps to. Tolerance is absolute (sub-pixel) so 6px reads off a 4px grid.
 */
export function classifyAgainstGrid(
  values: number[],
  grid: GridStep[],
  tolerancePx = 0.5,
): SpaceClassification[] {
  return values.map((px) => {
    let nearest = grid[0] ?? { px, name: nameForMultiple(1), multiple: 1, rem: 0 };
    let bestDiff = Math.abs(px - nearest.px);
    for (const s of grid) {
      const d = Math.abs(px - s.px);
      if (d < bestDiff) {
        bestDiff = d;
        nearest = s;
      }
    }
    return { px, onGrid: bestDiff <= tolerancePx, nearestPx: nearest.px, nearestName: nearest.name };
  });
}
