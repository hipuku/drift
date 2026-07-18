/**
 * Type-scale proposals — the deterministic Layer-2 generator for type.
 *
 * Given a base size (from the typography inventory), project it onto canonical
 * modular scales: size = base · ratio^n. The site's own sizes are the seed — we
 * generate just enough steps to cover the range actually in use, detect which
 * named ratio the current sizes are *closest* to, and flag which current sizes
 * fall off a chosen scale. All arithmetic; no model. Export formatters render the
 * chosen scale to CSS / DTCG / Tailwind.
 */

export interface NamedRatio {
  id: string;
  name: string;
  ratio: number;
}

/** The canonical scales, matching DESIGN.md. */
export const RATIOS: NamedRatio[] = [
  { id: "minor-third", name: "Minor third", ratio: 1.2 },
  { id: "major-third", name: "Major third", ratio: 1.25 },
  { id: "perfect-fourth", name: "Perfect fourth", ratio: 1.333 },
  { id: "augmented-fourth", name: "Augmented fourth", ratio: 1.414 },
  { id: "perfect-fifth", name: "Perfect fifth", ratio: 1.5 },
  { id: "golden", name: "Golden ratio", ratio: 1.618 },
];

export interface ScaleStep {
  /** Integer offset from the base (0 = base, negative = smaller). */
  step: number;
  /** T-shirt name for the step, relative to base. */
  name: string;
  px: number;
  /** Relative to the base size (base = 1rem). */
  rem: number;
}

const UP_NAMES = ["lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"];
const DOWN_NAMES = ["sm", "xs", "2xs", "3xs"];

/** Name a step relative to the base (0 → "base", +n → lg/xl/…, −n → sm/xs/…). */
export function nameForStep(step: number): string {
  if (step === 0) return "base";
  if (step > 0) return UP_NAMES[step - 1] ?? `${step}xl`;
  return DOWN_NAMES[-step - 1] ?? `${-step}xs`;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Build a scale from `basePx` on `ratio`, generating enough steps to cover
 * [minPx, maxPx]. Always includes the base (step 0). Sorted small → large.
 */
export function buildScaleToCover(
  basePx: number,
  ratio: number,
  minPx: number,
  maxPx: number,
): ScaleStep[] {
  const ln = Math.log(ratio);
  const lo = Math.min(minPx, basePx);
  const hi = Math.max(maxPx, basePx);
  const nMin = Math.floor(Math.log(lo / basePx) / ln);
  const nMax = Math.ceil(Math.log(hi / basePx) / ln);

  const steps: ScaleStep[] = [];
  for (let n = nMin; n <= nMax; n++) {
    const px = basePx * ratio ** n;
    steps.push({ step: n, name: nameForStep(n), px: round(px, 1), rem: round(px / basePx, 3) });
  }
  return steps;
}

export interface ScaleFit {
  ratio: NamedRatio;
  /** Mean relative error of the current sizes against this scale (0 = perfect). */
  error: number;
}

/**
 * Which canonical ratio are the current sizes closest to? For each size we snap
 * to the nearest geometric step from the base and measure the relative gap; the
 * ratio with the smallest mean gap wins. Returns null if there's nothing to fit.
 */
export function detectClosestRatio(sizes: number[], basePx: number): ScaleFit | null {
  const others = sizes.filter((px) => Math.abs(px - basePx) > 0.01);
  if (others.length === 0 || basePx <= 0) return null;

  let best: ScaleFit | null = null;
  for (const ratio of RATIOS) {
    const ln = Math.log(ratio.ratio);
    let total = 0;
    for (const px of others) {
      const n = Math.round(Math.log(px / basePx) / ln);
      const predicted = basePx * ratio.ratio ** n;
      total += Math.abs(px - predicted) / px;
    }
    const error = total / others.length;
    if (!best || error < best.error) best = { ratio, error };
  }
  return best;
}

export interface SizeClassification {
  px: number;
  onScale: boolean;
  /** Nearest scale step px. */
  nearestPx: number;
}

/**
 * Flag which current sizes sit on a chosen scale and which drift off it.
 * Tolerance is in px (default 0.75 — finer than a typical rounding step).
 */
export function classifyAgainstScale(
  sizes: number[],
  scale: ScaleStep[],
  tolerancePx = 0.75,
): SizeClassification[] {
  return sizes.map((px) => {
    let nearest = scale[0]?.px ?? px;
    let bestDiff = Math.abs(px - nearest);
    for (const s of scale) {
      const d = Math.abs(px - s.px);
      if (d < bestDiff) {
        bestDiff = d;
        nearest = s.px;
      }
    }
    return { px, onScale: bestDiff <= tolerancePx, nearestPx: nearest };
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────

/** CSS custom properties: `--text-<name>: <rem>rem;` */
export function toCssVariables(scale: ScaleStep[]): string {
  const lines = scale
    .slice()
    .reverse() // largest first reads better in a stylesheet
    .map((s) => `  --text-${s.name}: ${s.rem}rem;`);
  return `:root {\n${lines.join("\n")}\n}`;
}

/** Tailwind v4 `fontSize` config fragment. */
export function toTailwind(scale: ScaleStep[]): string {
  const entries = scale
    .slice()
    .reverse()
    .map((s) => `      "${s.name}": "${s.rem}rem"`);
  return `export default {\n  theme: {\n    fontSize: {\n${entries.join(",\n")},\n    },\n  },\n};`;
}

/** W3C Design Tokens (DTCG) dimension tokens. */
export function toDtcg(scale: ScaleStep[]): string {
  const tokens: Record<string, { $type: string; $value: string }> = {};
  for (const s of scale.slice().reverse()) {
    tokens[s.name] = { $type: "dimension", $value: `${s.rem}rem` };
  }
  return JSON.stringify({ fontSize: tokens }, null, 2);
}
