/**
 * Type-scale proposal math — client-side mirror of src/analysis/typeScale.ts.
 *
 * Lives here so the Apply interaction (pick a ratio, re-render the ladder) is
 * instant with no round-trip. Pure arithmetic; no model. Keep in sync with the
 * backend module if the canonical ratios or formatters change.
 */

export interface NamedRatio {
  id: string;
  name: string;
  ratio: number;
}

export const RATIOS: NamedRatio[] = [
  { id: "minor-third", name: "Minor third", ratio: 1.2 },
  { id: "major-third", name: "Major third", ratio: 1.25 },
  { id: "perfect-fourth", name: "Perfect fourth", ratio: 1.333 },
  { id: "augmented-fourth", name: "Augmented fourth", ratio: 1.414 },
  { id: "perfect-fifth", name: "Perfect fifth", ratio: 1.5 },
  { id: "golden", name: "Golden ratio", ratio: 1.618 },
];

/** Distinct font size in use, with how often it appears. */
export interface SizeUsage {
  px: number;
  count: number;
}

/** The slice of the typography inventory the proposal needs. */
export interface TypeInventory {
  baseSizePx: number | null;
  primaryFamily: string | null;
  sizes: SizeUsage[];
}

export interface ScaleStep {
  step: number;
  name: string;
  px: number;
  rem: number;
}

const UP_NAMES = ["lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"];
const DOWN_NAMES = ["sm", "xs", "2xs", "3xs"];

export function nameForStep(step: number): string {
  if (step === 0) return "base";
  if (step > 0) return UP_NAMES[step - 1] ?? `${step}xl`;
  return DOWN_NAMES[-step - 1] ?? `${-step}xs`;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

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
  error: number;
}

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
  nearestPx: number;
}

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

export type ExportFormat = "css" | "tailwind" | "dtcg";

export function toCssVariables(scale: ScaleStep[]): string {
  const lines = scale
    .slice()
    .reverse()
    .map((s) => `  --text-${s.name}: ${s.rem}rem;`);
  return `:root {\n${lines.join("\n")}\n}`;
}

export function toTailwind(scale: ScaleStep[]): string {
  const entries = scale
    .slice()
    .reverse()
    .map((s) => `      "${s.name}": "${s.rem}rem"`);
  return `export default {\n  theme: {\n    fontSize: {\n${entries.join(",\n")},\n    },\n  },\n};`;
}

export function toDtcg(scale: ScaleStep[]): string {
  const tokens: Record<string, { $type: string; $value: string }> = {};
  for (const s of scale.slice().reverse()) {
    tokens[s.name] = { $type: "dimension", $value: `${s.rem}rem` };
  }
  return JSON.stringify({ fontSize: tokens }, null, 2);
}

export function exportScale(scale: ScaleStep[], format: ExportFormat): string {
  if (format === "tailwind") return toTailwind(scale);
  if (format === "dtcg") return toDtcg(scale);
  return toCssVariables(scale);
}
