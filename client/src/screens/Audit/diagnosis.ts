/**
 * The diagnosis as pure functions: the verdict cards, the sets the verdicts are
 * measured against, and the export.
 *
 * These lived inside the Audit screen's render. They moved here so that a
 * second consumer, the landing page in `site/`, renders the same verdicts and
 * the same export from the same fixture without restating the rules.
 */

import type { SiteAudit } from "../../lib/api.js";
import {
  buildScaleToCover,
  classifyAgainstScale,
  detectClosestRatio,
} from "../../lib/typeScale.js";
import {
  INDISTINGUISHABLE_DELTA_E,
  RADIUS_NEAR_DUPLICATE_PX,
  SHADOW_WATCH_COUNT,
  detectGridBase,
  extendedDriftAreas,
  healthLine,
  hostOf,
  nearDuplicates,
  offGrid,
  plural,
  redundancyVerdict,
  type Verdict,
} from "./auditModel.js";

export interface VerdictCard {
  label: string;
  n: number;
  chips: string[];
  verdict: Verdict;
}

type Sizes = SiteAudit["typography"]["sizes"];

/** The most used size, the base the modular scales are built from. */
export function typeBasePxOf(sizes: Sizes): number {
  return sizes.length ? sizes.reduce((a, b) => (b.count > a.count ? b : a)).px : 16;
}

/** Sizes that miss a given ratio, the ruler's red dots and the table's. */
export function offScaleSet(sizes: Sizes, basePx: number, ratio: number): Set<number> {
  const px = sizes.map((z) => z.px);
  if (px.length < 2) return new Set();
  const scale = buildScaleToCover(basePx, ratio, Math.min(...px), Math.max(...px));
  return new Set(
    classifyAgainstScale(px, scale)
      .filter((m) => !m.onScale)
      .map((m) => m.px),
  );
}

export function buildVerdicts(audit: SiteAudit): VerdictCard[] {
  const s = audit.summary;
  const offScale = s.typeOffScale ?? 0;
  const offGridTotal = s.spacingOffGrid ?? 0;
  const radiusDup = s.radiusNearDuplicates ?? 0;

  const verdicts: VerdictCard[] = [
    {
      label: "Colours",
      n: s.distinctColours,
      verdict: redundancyVerdict(s.colourNearDuplicates),
      chips: [
        `${s.colourFamilies} ${plural(s.colourFamilies, "family", "families")}`,
        s.colourNearDuplicates > 0
          ? `${s.colourNearDuplicates} near-${plural(s.colourNearDuplicates, "duplicate")}`
          : "no near-duplicates",
      ],
    },
    ...((s.contrastPairs ?? 0) > 0
      ? [
          {
            label: "Contrast",
            n: s.contrastPairs!,
            // A failing pair is a reader who can't read the page, the one
            // finding that warrants "review" outright rather than "watch".
            verdict: ((s.contrastFailingAA ?? 0) > 0 ? "review" : "good") as Verdict,
            chips: [
              (s.contrastFailingAA ?? 0) > 0
                ? `${s.contrastFailingAA} ${plural(s.contrastFailingAA!, "pair")} fail AA`
                : "all pairs pass AA",
            ],
          },
        ]
      : []),
    {
      label: "Type",
      n: s.typeSizes,
      verdict: redundancyVerdict(offScale),
      chips: [
        `${s.fontFamilies} ${plural(s.fontFamilies, "family", "families")}`,
        `${s.fontWeights} ${plural(s.fontWeights, "weight")}`,
        offScale > 0 ? `${offScale} off-scale` : "on a scale",
      ],
    },
    {
      label: "Spacing",
      n: s.spacings,
      verdict: redundancyVerdict(offGridTotal),
      chips: [offGridTotal > 0 ? `${offGridTotal} off a 4px grid` : "on a 4px grid"],
    },
    {
      label: "Radius",
      n: s.radii,
      verdict: radiusDup > 0 ? "watch" : "good",
      chips: [
        radiusDup > 0
          ? `${radiusDup} near-${plural(radiusDup, "duplicate")}`
          : s.radii === 0
            ? "none in use"
            : `${s.radii} ${plural(s.radii, "value")}`,
      ],
    },
    {
      label: "Shadows",
      n: s.shadows,
      verdict: s.shadows > SHADOW_WATCH_COUNT ? "watch" : "good",
      chips: [s.shadows === 0 ? "none in use" : `${s.shadows} ${plural(s.shadows, "value")}`],
    },
  ];
  // The core five are always shown; grey out any that isn't in use.
  for (const v of verdicts) {
    if (v.n === 0) {
      v.verdict = "empty";
      v.chips = ["none in use"];
    }
  }
  // Extended tokens appear only when present, as neutral (informational) cards.
  const pushExtended = (label: string, list: { length: number } | undefined, unit: string) => {
    if (list && list.length) {
      verdicts.push({
        label,
        n: list.length,
        verdict: "neutral",
        chips: [`${list.length} ${plural(list.length, unit)}`],
      });
    }
  };
  pushExtended("Border", audit.borders, "width");
  pushExtended("Opacity", audit.opacity, "value");
  pushExtended("Z-index", audit.zIndex, "value");
  pushExtended("Blur", audit.blur, "value");
  pushExtended("Breakpoints", audit.breakpoints, "value");
  pushExtended("Gradient", audit.gradients, "value");
  if (audit.motion && (audit.motion.durations.length || audit.motion.easings.length)) {
    verdicts.push({
      label: "Motion",
      n: audit.motion.durations.length + audit.motion.easings.length,
      verdict: "neutral",
      chips: [
        `${audit.motion.durations.length} ${plural(audit.motion.durations.length, "duration")}`,
        `${audit.motion.easings.length} ${plural(audit.motion.easings.length, "easing")}`,
      ],
    });
  }
  return verdicts;
}

/**
 * The audit as data, for machines, not readers: a CI check to assert on, two
 * runs to diff, or a model to reason over. So it leads with the *diagnosis*
 * (health, findings, verdicts) and the rules those rest on, and keeps the full
 * inventory underneath as the evidence. Exporting the inventory alone would
 * make the consumer re-derive the judgement Drift already made.
 *
 * The evidence sets are measured against the *automatic* references, never the
 * reader's selection on the Type or Spacing tab. The export's counts come from
 * the server's summary, so evidence drawn from the live selection would ship a
 * finding whose count says "miss the 4px grid" beside a list of values that
 * miss an 8px one. Same numbers, different question.
 */
export function buildExport(audit: SiteAudit, generatedAt: Date) {
  const s = audit.summary;
  const t = audit.typography;
  const host = hostOf(audit.rootUrl);
  const typeBasePx = typeBasePxOf(t.sizes);
  const typeFit = detectClosestRatio(
    t.sizes.map((z) => z.px),
    typeBasePx,
  );

  const diagnosisOffScalePx = typeFit
    ? offScaleSet(t.sizes, typeBasePx, typeFit.ratio.ratio)
    : new Set<number>();
  const spacingValues = audit.spacing.map((sp) => sp.value);
  const diagnosisOffGridSet = offGrid(spacingValues, detectGridBase(spacingValues));
  const radiusNearDupSet = nearDuplicates(
    audit.radius.map((r) => r.value),
    RADIUS_NEAR_DUPLICATE_PX,
  );

  // Findings are only the categories with an issue. `verdicts` below lists
  // every category.
  const findings: unknown[] = [];
  const failingAA = s.contrastFailingAA ?? 0;
  if (failingAA > 0) {
    findings.push({
      id: "contrast-fails-aa",
      category: "contrast",
      severity: "review",
      title: `${failingAA} of ${s.contrastPairs} text/background ${plural(s.contrastPairs ?? 0, "pair")} fail WCAG AA`,
      count: failingAA,
      of: s.contrastPairs,
      evidence: (audit.contrast ?? [])
        .filter((c) => !c.passAA)
        .map((c) => ({
          foreground: c.foreground,
          background: c.background,
          ratio: Number(c.ratio.toFixed(2)),
          uses: c.count,
        })),
    });
  }
  if (s.colourNearDuplicates > 0) {
    findings.push({
      id: "colour-near-duplicates",
      category: "colour",
      severity: redundancyVerdict(s.colourNearDuplicates),
      title: `${s.colourNearDuplicates} of ${s.distinctColours} colours are near-duplicates`,
      count: s.colourNearDuplicates,
      of: s.distinctColours,
      evidence: audit.colourFamilies
        .flatMap((f) => f.swatches)
        .filter((w) => w.nearest && w.nearest.deltaE < INDISTINGUISHABLE_DELTA_E)
        .map((w) => ({
          hex: w.hex,
          nearest: w.nearest!.hex,
          deltaE: Number(w.nearest!.deltaE.toFixed(2)),
        })),
    });
  }
  const offScaleCount = s.typeOffScale ?? 0;
  if (offScaleCount > 0) {
    findings.push({
      id: "type-off-scale",
      category: "type",
      severity: redundancyVerdict(offScaleCount),
      title: `${offScaleCount} of ${s.typeSizes} type sizes fall off the closest modular scale`,
      count: offScaleCount,
      of: s.typeSizes,
      evidence: [...diagnosisOffScalePx].map((px) => ({ px })),
    });
  }
  const offGridCount = s.spacingOffGrid ?? 0;
  if (offGridCount > 0) {
    findings.push({
      id: "spacing-off-grid",
      category: "spacing",
      severity: redundancyVerdict(offGridCount),
      title: `${offGridCount} of ${s.spacings} spacing values miss the 4px grid`,
      count: offGridCount,
      of: s.spacings,
      evidence: [...diagnosisOffGridSet].map((px) => ({ px })),
    });
  }
  const radiusDupCount = s.radiusNearDuplicates ?? 0;
  if (radiusDupCount > 0) {
    findings.push({
      id: "radius-near-duplicates",
      category: "radius",
      severity: "watch",
      title: `${radiusDupCount} of ${s.radii} radii nearly repeat`,
      count: radiusDupCount,
      of: s.radii,
      evidence: [...radiusNearDupSet].map((px) => ({ px })),
    });
  }

  return {
    tool: "drift",
    version: 1,
    site: { url: audit.rootUrl, host, pages: s.pages },
    generatedAt: generatedAt.toISOString(),

    // The diagnosis, in the same words the report uses.
    health: healthLine(s, extendedDriftAreas(audit.borders, audit.zIndex)),
    findings,
    verdicts: buildVerdicts(audit).map((v) => ({
      category: v.label,
      count: v.n,
      verdict: v.verdict,
      detail: v.chips,
    })),

    // What the verdicts were measured against, so the numbers are anchored.
    rules: {
      colour: { indistinguishableDeltaE: INDISTINGUISHABLE_DELTA_E, metric: "CIEDE2000" },
      type: {
        closestRatio: typeFit ? { name: typeFit.ratio.name, ratio: typeFit.ratio.ratio } : null,
      },
      spacing: { gridBasePx: 4, tolerancePx: 0.5 },
      radius: { nearDuplicateTolerancePx: 1 },
      contrast: { standard: "WCAG 2.1", threshold: "AA (4.5:1 normal, 3:1 large)" },
    },

    summary: audit.summary,
    inventory: {
      colourFamilies: audit.colourFamilies,
      typography: audit.typography,
      spacing: audit.spacing,
      radius: audit.radius,
      shadow: audit.shadow,
      borders: audit.borders,
      opacity: audit.opacity,
      zIndex: audit.zIndex,
      blur: audit.blur,
      gradients: audit.gradients,
      motion: audit.motion,
      breakpoints: audit.breakpoints,
      contrast: audit.contrast,
    },
    authored: audit.authored,
  };
}
