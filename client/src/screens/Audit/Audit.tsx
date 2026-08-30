/**
 * The Audit, Stage 1, "what it is".
 *
 * Two presentation modes, chosen by what the token *is*:
 *  - Cards for tokens you judge visually, colour swatches, type families,
 *    shadows, gradients. A specimen with its value and usage.
 *  - Tables for scalar tokens, the type scale, spacing, radius, borders, etc.
 *    A small specimen, the value, and usage, in aligned rows with dividers.
 *
 * Overview is the diagnosis: a synthesised health line plus verdict cards
 * tinted green / orange / red (good / watch / needs-review) with the detail as
 * pills. The colour, and a bottom accent rule, is the verdict.
 */

import {
  faBolt,
  faBorderStyle,
  faChartSimple,
  faCircleHalfStroke,
  faClone,
  faDesktop,
  faDroplet,
  faFillDrip,
  faFont,
  faLayerGroup,
  faPalette,
  faRulerHorizontal,
  faShapes,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import type { AuditAuthored, SiteAudit } from "../../lib/api.js";
import { RATIOS, buildScaleToCover, classifyAgainstScale, detectClosestRatio } from "../../lib/typeScale.js";
import {
  INDISTINGUISHABLE_DELTA_E,
  RADIUS_NEAR_DUPLICATE_PX,
  cardId,
  detectGridBase,
  extendedDriftAreas,
  healthLine,
  hostOf,
  nearDuplicates,
  offGrid,
  plural,
  redundancyVerdict,
  type DisplayUnit,
  type Verdict,
} from "./auditModel.js";
import {
  BlurSection,
  BorderSection,
  BreakpointSection,
  ContrastSection,
  GradientSection,
  MotionSection,
  OpacitySection,
  RadiusSection,
  ShadowSection,
  ZIndexSection,
} from "./sections/scalarSections.js";
import { ColourCard, ColourDetail, ColourDrawerTitle } from "./parts/colour.js";
import { OverviewSection } from "./sections/overviewSection.js";
import { SpacingSection, TypeSection } from "./sections/scaleSections.js";
import styles from "./Audit.module.css";

/** An icon per token tab, gives the strip identity and speeds scanning. */
const TAB_ICON: Record<string, IconDefinition> = {
  overview: faChartSimple,
  colour: faPalette,
  contrast: faCircleHalfStroke,
  type: faFont,
  spacing: faRulerHorizontal,
  radius: faShapes,
  shadow: faClone,
  border: faBorderStyle,
  opacity: faCircleHalfStroke,
  zindex: faLayerGroup,
  blur: faDroplet,
  breakpoint: faDesktop,
  gradient: faFillDrip,
  motion: faBolt,
};

interface Props {
  audit: SiteAudit;
  onBack?: () => void;
}



export function Audit({ audit, onBack }: Props) {
  const s = audit.summary;
  const t = audit.typography;
  const family = t.families[0]?.family ?? null;
  const fontStack = family ? `'${family}', var(--font-sans)` : "var(--font-sans)";

  const tabs = useMemo(() => {
    const list = [
      { id: "overview", label: "Overview", count: null as number | null },
      { id: "colour", label: "Colour", count: s.distinctColours },
      ...(audit.contrast?.length
        ? [{ id: "contrast", label: "Contrast", count: audit.contrast.length }]
        : []),
      { id: "type", label: "Type", count: s.typeSizes },
      { id: "spacing", label: "Spacing", count: s.spacings },
    ];
    if (audit.radius.length) list.push({ id: "radius", label: "Radius", count: s.radii });
    if (audit.shadow.length) list.push({ id: "shadow", label: "Shadow", count: s.shadows });
    if (audit.borders?.length) list.push({ id: "border", label: "Border", count: audit.borders.length });
    if (audit.opacity?.length) list.push({ id: "opacity", label: "Opacity", count: audit.opacity.length });
    if (audit.zIndex?.length) list.push({ id: "zindex", label: "Z-index", count: audit.zIndex.length });
    if (audit.blur?.length) list.push({ id: "blur", label: "Blur", count: audit.blur.length });
    if (audit.breakpoints?.length) list.push({ id: "breakpoint", label: "Breakpoints", count: audit.breakpoints.length });
    if (audit.gradients?.length) list.push({ id: "gradient", label: "Gradient", count: audit.gradients.length });
    if (audit.motion && (audit.motion.durations.length || audit.motion.easings.length))
      list.push({ id: "motion", label: "Motion", count: audit.motion.durations.length + audit.motion.easings.length });
    return list;
  }, [s, audit]);

  const [tab, setTab] = useState("overview");
  const [pickedHex, setSelectedHex] = useState<string | null>(null);
  const [flashHex, setFlashHex] = useState<string | null>(null);

  // Picking a neighbour from the rail: swap the detail to it, then scroll its
  // card into view on the left and flash it so the jump stays legible.
  const pickColour = useCallback((hex: string) => {
    setSelectedHex(hex);
    setFlashHex(hex);
    requestAnimationFrame(() => {
      document.getElementById(cardId(hex))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    if (!flashHex) return;
    const t = setTimeout(() => setFlashHex(null), 1100);
    return () => clearTimeout(t);
  }, [flashHex]);

  // The detail rail belongs to the Colour tab, leaving it closes the rail.
  // Derived rather than cleared in an effect: the rail's visibility is a
  // function of the current tab, so computing it during render avoids the
  // extra pass a reset effect would schedule.
  const selectedHex = tab === "colour" ? pickedHex : null;

  // ── Reference scales ────────────────────────────────────────────────────────
  // "Off-scale" is a measurement against a reference, so the reference is
  // selectable: compare the system against any named ratio, or against a 4px or
  // 8px grid. The selection drives this section's ruler and table together; the
  // Overview verdict stays pinned to the automatic best fit, so exploring a
  // hypothetical never rewrites the diagnosis.
  const typeBasePx = t.sizes.length
    ? t.sizes.reduce((a, b) => (b.count > a.count ? b : a)).px
    : 16;
  /**
   * The closest scale is the one the fewest sizes miss, with mean relative error
   * as the tie-break. Ranking purely by mean error (what detectClosestRatio
   * returns) can crown a ratio that fits most sizes tightly but tips a couple
   * over the tolerance, leaving the option marked "closest" showing a higher
   * off-count than its neighbours, which reads as a bug.
   */
  const bestRatio = useMemo(() => {
    const px = t.sizes.map((z) => z.px);
    if (px.length < 2) return null;
    const errorOf = (ratio: number) => {
      const ln = Math.log(ratio);
      const others = px.filter((v) => Math.abs(v - typeBasePx) > 0.01);
      if (!others.length) return Number.POSITIVE_INFINITY;
      let total = 0;
      for (const v of others) {
        const n = Math.round(Math.log(v / typeBasePx) / ln);
        total += Math.abs(v - typeBasePx * ratio ** n) / v;
      }
      return total / others.length;
    };
    let best: { id: string; name: string; ratio: number } | null = null;
    let bestOff = Number.POSITIVE_INFINITY;
    let bestErr = Number.POSITIVE_INFINITY;
    for (const r of RATIOS) {
      const scale = buildScaleToCover(typeBasePx, r.ratio, Math.min(...px), Math.max(...px));
      const off = classifyAgainstScale(px, scale).filter((m) => !m.onScale).length;
      const err = errorOf(r.ratio);
      if (off < bestOff || (off === bestOff && err < bestErr)) {
        best = r;
        bestOff = off;
        bestErr = err;
      }
    }
    return best;
  }, [t.sizes, typeBasePx]);

  /** Sizes that miss a given ratio, the ruler's red dots and the table's. */
  const offScaleFor = useCallback(
    (ratio: number): Set<number> => {
      const px = t.sizes.map((z) => z.px);
      if (px.length < 2) return new Set();
      const scale = buildScaleToCover(typeBasePx, ratio, Math.min(...px), Math.max(...px));
      return new Set(classifyAgainstScale(px, scale).filter((m) => !m.onScale).map((m) => m.px));
    },
    [t.sizes, typeBasePx],
  );

  /**
   * The same two sets measured against the *automatic* reference rather than
   * the reader's, for the export.
   *
   * Both scale and grid are selectable so a reader can test a hypothesis, and
   * the diagnosis is deliberately pinned to the automatic fit so that exploring
   * one never rewrites it. The export has to honour the same rule: its counts
   * come from the server's summary, so evidence drawn from the live selection
   * would ship a finding whose count says "miss the 4px grid" beside a list of
   * values that miss an 8px one. Same numbers, different question.
   */
  const diagnosisOffScalePx = useMemo(
    () => (bestRatio ? offScaleFor(bestRatio.ratio) : new Set<number>()),
    [bestRatio, offScaleFor],
  );

  const spacingValues = useMemo(() => audit.spacing.map((sp) => sp.value), [audit.spacing]);
  const detectedBase = useMemo(() => detectGridBase(spacingValues), [spacingValues]);
  /** The grid the diagnosis was made against, see diagnosisOffScalePx above. */
  const diagnosisOffGridSet = useMemo(
    () => offGrid(spacingValues, detectedBase),
    [spacingValues, detectedBase],
  );
  const radiusNearDupSet = useMemo(
    () => nearDuplicates(audit.radius.map((r) => r.value), RADIUS_NEAR_DUPLICATE_PX),
    [audit.radius],
  );
  const extendedDrift = useMemo(
    () => extendedDriftAreas(audit.borders, audit.zIndex),
    [audit.borders, audit.zIndex],
  );
  const selectedSwatch = selectedHex
    ? (audit.colourFamilies.flatMap((f) => f.swatches).find((sw) => sw.hex === selectedHex) ?? null)
    : null;

  const offScale = s.typeOffScale ?? 0;
  const offGridTotal = s.spacingOffGrid ?? 0;
  const radiusDup = s.radiusNearDuplicates ?? 0;

  const verdicts: { label: string; n: number; chips: string[]; verdict: Verdict }[] = [
    {
      label: "Colours",
      n: s.distinctColours,
      verdict: redundancyVerdict(s.colourNearDuplicates),
      chips: [
        `${s.colourFamilies} ${plural(s.colourFamilies, "family", "families")}`,
        s.colourNearDuplicates > 0
          ? `${s.colourNearDuplicates} indistinguishable`
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
      verdict: s.shadows > 6 ? "watch" : "good",
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
      verdicts.push({ label, n: list.length, verdict: "neutral", chips: [`${list.length} ${plural(list.length, unit)}`] });
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

  /**
   * The audit as data, for machines, not readers: a CI check to assert on, two
   * runs to diff, or a model to reason over. So it leads with the *diagnosis*
   * (health, findings, verdicts) and the rules those rest on, and keeps the full
   * inventory underneath as the evidence. Exporting the inventory alone would
   * make the consumer re-derive the judgement Drift already made.
   */
  const exportJson = () => {
    const host = hostOf(audit.rootUrl);
    const generatedAt = new Date();

    const typeFit = detectClosestRatio(
      t.sizes.map((z) => z.px),
      t.sizes.length ? t.sizes.reduce((a, b) => (b.count > a.count ? b : a)).px : 16,
    );

    // Only genuine problems become findings; `verdicts` below carries the full
    // per-category picture, including the categories that are holding.
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
        title: `${s.colourNearDuplicates} of ${s.distinctColours} colours are indistinguishable from another`,
        count: s.colourNearDuplicates,
        of: s.distinctColours,
        evidence: audit.colourFamilies
          .flatMap((f) => f.swatches)
          .filter((w) => w.nearest && w.nearest.deltaE < INDISTINGUISHABLE_DELTA_E)
          .map((w) => ({ hex: w.hex, nearest: w.nearest!.hex, deltaE: Number(w.nearest!.deltaE.toFixed(2)) })),
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

    const payload = {
      $schema: "https://drift.hipuku.dev/schema/audit-v1.json",
      tool: "drift",
      version: 1,
      site: { url: audit.rootUrl, host, pages: s.pages },
      generatedAt: generatedAt.toISOString(),

      // The diagnosis, in the same words the report uses.
      health: healthLine(s, extendedDrift),
      findings,
      verdicts: verdicts.map((v) => ({
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

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    // Dated so successive audits of the same site sort and don't overwrite.
    a.download = `drift-audit-${host}-${generatedAt.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  // Type scale rows, one per distinct size (largest first), so the table matches
  // the ruler and the tab count, with every weight and the tags that use it.
  // Sizes that miss the closest modular scale, mirrors the ruler's red dots.

  /**
   * Lead each scalar table with the unit the site actually authors in, rather
   * than a toggle the reader has to discover. `authored` reads the real unit
   * per category off the stylesheets, so a rem-authored type scale reads in rem
   * and a px-authored one reads in px. The choice is a finding, not a setting.
   */
  const unitFor = useCallback(
    (category: AuditAuthored["categories"][number]["category"]): DisplayUnit =>
      audit.authored?.categories.find((c) => c.category === category)?.dominant === "rem"
        ? "rem"
        : "px",
    [audit.authored],
  );

  return (
    <div className={styles.page}>
      <div className={`${styles.layout}${selectedSwatch ? ` ${styles.layoutOpen}` : ""}`}>
        <div className={styles.main}>
      <header>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            <span aria-hidden="true">←</span> New audit
          </button>
        )}
        <div className={styles.titleRow}>
          <div>
            <Text role="display" as="h1" className={styles.title}>
              {hostOf(audit.rootUrl)}
            </Text>
            <Text role="body-lg" as="p" className={styles.intro}>
              Everything in use across {s.pages} {plural(s.pages, "page")}, exactly as shipped.
            </Text>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={exportJson}>
              Export
            </button>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Audit sections">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={tab === tb.id}
              className={tab === tb.id ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {TAB_ICON[tb.id] && <FontAwesomeIcon icon={TAB_ICON[tb.id]!} className={styles.tabIcon} />}
              {tb.label}
              {tb.count != null && <span className={styles.tabCount}>{tb.count}</span>}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.panel} key={tab}>
        {tab === "overview" && (
          <OverviewSection
            health={healthLine(s, extendedDrift)}
            verdicts={verdicts}
            authored={audit.authored}
            tabIcon={TAB_ICON}
            hasTab={(id) => tabs.some((tb) => tb.id === id)}
            onGoToTab={setTab}
          />
        )}


        {tab === "colour" && (
          <>
            {audit.colourFamilies.map((fam) => (
              <div key={fam.name} className={styles.family}>
                <div className={styles.familyHead}>
                  <Text role="heading-sm" as="h3">
                    {fam.name}
                  </Text>
                  <Text role="label-sm" className={styles.muted}>
                    {fam.swatches.length}
                  </Text>
                </div>
                <div className={styles.grid}>
                  {fam.swatches.map((sw) => (
                    <ColourCard
                      key={sw.hex}
                      sw={sw}
                      id={cardId(sw.hex)}
                      selected={selectedHex === sw.hex}
                      flash={flashHex === sw.hex}
                      onSelect={() => setSelectedHex(sw.hex)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "type" && (
          <TypeSection
            typography={t}
            pages={s.pages}
            fontStack={fontStack}
            unit={unitFor("type")}
            bestRatio={bestRatio}
            offScaleFor={offScaleFor}
          />
        )}

        {tab === "spacing" && (
          <SpacingSection spacing={audit.spacing} unit={unitFor("spacing")} />
        )}


        {tab === "radius" && <RadiusSection radius={audit.radius} unit={unitFor("radius")} />}

        {tab === "shadow" && <ShadowSection shadow={audit.shadow} />}

        {tab === "gradient" && audit.gradients && <GradientSection gradients={audit.gradients} />}

        {tab === "border" && audit.borders && (
          <BorderSection borders={audit.borders} unit={unitFor("border")} />
        )}

        {tab === "contrast" && audit.contrast && <ContrastSection contrast={audit.contrast} />}

        {tab === "opacity" && audit.opacity && <OpacitySection opacity={audit.opacity} />}

        {tab === "zindex" && audit.zIndex && <ZIndexSection zIndex={audit.zIndex} />}

        {tab === "blur" && audit.blur && <BlurSection blur={audit.blur} />}

        {tab === "breakpoint" && audit.breakpoints && (
          <BreakpointSection breakpoints={audit.breakpoints} />
        )}

        {tab === "motion" && audit.motion && <MotionSection motion={audit.motion} />}
      </div>
        </div>

        {selectedSwatch && (
          <aside className={styles.rail}>
            <div className={styles.railInner}>
              <div className={styles.railHeader}>
                <div key={selectedSwatch.hex} className={styles.railFade}>
                  <ColourDrawerTitle sw={selectedSwatch} totalPages={s.pages} />
                </div>
                <button
                  type="button"
                  className={styles.railClose}
                  onClick={() => setSelectedHex(null)}
                  aria-label="Close detail"
                >
                  ✕
                </button>
              </div>
              <div className={styles.railBody}>
                <div key={selectedSwatch.hex} className={styles.railFade}>
                  <ColourDetail sw={selectedSwatch} totalPages={s.pages} onPick={pickColour} />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
