/**
 * Radius proposal math. Unlike spacing, radius isn't a multiplicative grid you
 * detect from the data — it's a small, semantic vocabulary. So we fit the site's
 * observed radii onto a *fixed* canonical ramp (the known-good structure) and
 * flag anything off it, with the token it would fold into. Near-duplicates
 * consolidate for free: 5px snaps to `sm` (4px). A `full` pill step appears only
 * when the site actually uses large radii. Pure arithmetic.
 */

export interface RadiusStep {
  name: string;
  px: number;
}

/** The canonical ramp. `full` is appended by the builder only when warranted. */
const CORE_RAMP: RadiusStep[] = [
  { name: "none", px: 0 },
  { name: "sm", px: 4 },
  { name: "md", px: 8 },
  { name: "lg", px: 12 },
  { name: "xl", px: 16 },
  { name: "2xl", px: 24 },
];

/** Radii at or above this read as a pill, not a scalar step. */
export const PILL_THRESHOLD = 40;
const PILL: RadiusStep = { name: "full", px: 9999 };

/** Distinct radius in use, with how often it appears. */
export interface RadiusUsage {
  px: number;
  count: number;
}

/**
 * The ramp to fit against. Always the core steps up to the largest observed
 * scalar radius (so we don't propose `2xl` for a site whose biggest corner is
 * 8px), plus `full` when any radius crosses the pill threshold.
 */
export function buildRadiusRamp(values: number[]): RadiusStep[] {
  const scalars = values.filter((v) => v > 0 && v < PILL_THRESHOLD);
  const maxScalar = scalars.length ? Math.max(...scalars) : 0;
  const steps = CORE_RAMP.filter((s) => s.px <= Math.max(maxScalar, 8));
  if (values.some((v) => v >= PILL_THRESHOLD)) steps.push(PILL);
  return steps;
}

export interface RadiusClassification {
  px: number;
  onRamp: boolean;
  nearest: RadiusStep;
}

/**
 * Classify each observed radius against the ramp. Pill-range values match `full`
 * outright; scalar values match the nearest step within tolerance, else they're
 * flagged off-ramp with the step they'd fold into.
 */
export function classifyAgainstRamp(
  values: number[],
  ramp: RadiusStep[],
  tolerancePx = 0.5,
): RadiusClassification[] {
  const pill = ramp.find((s) => s.name === "full");
  const scalars = ramp.filter((s) => s.name !== "full");
  return values.map((px) => {
    if (px >= PILL_THRESHOLD && pill) return { px, onRamp: true, nearest: pill };
    let nearest = scalars[0] ?? { name: "none", px: 0 };
    let bestDiff = Math.abs(px - nearest.px);
    for (const s of scalars) {
      const d = Math.abs(px - s.px);
      if (d < bestDiff) {
        bestDiff = d;
        nearest = s;
      }
    }
    return { px, onRamp: bestDiff <= tolerancePx, nearest };
  });
}
