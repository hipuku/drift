/**
 * The Audit — Stage 1, "what it is".
 *
 * Two presentation modes, chosen by what the token *is*:
 *  - Cards for tokens you judge visually — colour swatches, type families,
 *    shadows, gradients. A specimen with its value and usage.
 *  - Tables for scalar tokens — the type scale, spacing, radius, borders, etc.
 *    A small specimen, the value, and usage, in aligned rows with dividers.
 *
 * Overview is the diagnosis: a synthesised health line plus verdict cards
 * tinted green / orange / red (good / watch / needs-review) with the detail as
 * pills. The colour — and a bottom accent rule — is the verdict.
 */

import {
  faBolt,
  faBorderStyle,
  faChartSimple,
  faChevronDown,
  faChevronUp,
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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "../../components/Badge/Badge.js";
import { Callout } from "../../components/Callout/Callout.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditAuthored, AuditColourSwatch, CssUnit, SiteAudit } from "../../lib/api.js";
import { RATIOS, buildScaleToCover, classifyAgainstScale, detectClosestRatio } from "../../lib/typeScale.js";
import styles from "./Audit.module.css";

/** ΔE below which two colours are effectively identical (mirrors the analysis). */
const INDISTINGUISHABLE_DELTA_E = 2;

/** ΔE above which the nearest colour is too far apart to be worth surfacing. */
const NEAREST_DELTA_E = 5;

type Verdict = "good" | "watch" | "review" | "neutral" | "empty";

/** Which tab an overview verdict card links to. */
const VERDICT_TAB: Record<string, string> = {
  Colours: "colour",
  Type: "type",
  Spacing: "spacing",
  Radius: "radius",
  Shadows: "shadow",
  Border: "border",
  Opacity: "opacity",
  "Z-index": "zindex",
  Blur: "blur",
  Breakpoints: "breakpoint",
  Gradient: "gradient",
  Motion: "motion",
};

/** An icon per token tab — gives the strip identity and speeds scanning. */
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

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/** Oxford-comma join: ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The diagnosis line — where the system is drifting, in plain terms. Names every
 * token category present: those with redundancy get a "N of M …" problem clause,
 * the rest are gathered as holding steady. Reads as prose, not a census.
 */
function healthLine(s: SiteAudit["summary"], extendedDrift: string[] = []): string {
  const problems: string[] = [];
  const clean: string[] = [];

  const colourDup = s.colourNearDuplicates ?? 0;
  if (colourDup > 0)
    problems.push(`${colourDup} of ${s.distinctColours} colours are near-duplicates`);
  else clean.push("colour");

  const offScale = s.typeOffScale ?? 0;
  if (offScale > 0) problems.push(`${offScale} of ${s.typeSizes} type sizes fall off the scale`);
  else clean.push("type");

  const offGrid = s.spacingOffGrid ?? 0;
  if (offGrid > 0) problems.push(`${offGrid} of ${s.spacings} spacing values miss the 4px grid`);
  else clean.push("spacing");

  const radiusDup = s.radiusNearDuplicates ?? 0;
  if (s.radii > 0) {
    if (radiusDup > 0) problems.push(`${radiusDup} of ${s.radii} radii nearly repeat`);
    else clean.push("radius");
  }
  if (s.shadows > 0) clean.push("shadows"); // no redundancy signal — treated as holding

  // Contrast is the one finding with a user-facing consequence, so it leads the
  // problem list rather than joining the sprawl counts.
  const failingAA = s.contrastFailingAA ?? 0;
  if ((s.contrastPairs ?? 0) > 0) {
    if (failingAA > 0)
      problems.unshift(
        `${failingAA} of ${s.contrastPairs} text/background pairs fail WCAG AA`,
      );
    else clean.push("contrast");
  }

  const tail = extendedDrift.length ? ` Also drifting: ${joinList(extendedDrift)}.` : "";

  if (problems.length === 0) {
    return `Nothing's drifting — ${joinList(clean)} all hold to a system.${tail}`;
  }
  const problemText = `${capFirst(joinList(problems))}.`;
  if (clean.length === 0) return `${problemText}${tail}`;
  return `${problemText} ${capFirst(joinList(clean))} ${plural(clean.length, "holds", "hold")} steady.${tail}`;
}

/** Stable DOM id for a colour card, so picking a neighbour can scroll it into view. */
function cardId(hex: string): string {
  return `swatch-${hex.replace(/[^a-z0-9]/gi, "")}`;
}

/** Alpha channel of an 8-digit hex as a 0–1 fraction; 1 for an opaque #RRGGBB. */
function alphaOf(hex: string): number {
  return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

/** Two colours share an RGB base — they differ, if at all, only in alpha. */
function sameBaseColour(a: string, b: string): boolean {
  return a.slice(0, 7).toLowerCase() === b.slice(0, 7).toLowerCase();
}

type NearKind = "opacity" | "duplicate" | "nearest";

/**
 * How a colour relates to its nearest neighbour. ΔE ignores alpha, so a colour
 * and its translucent self read as ΔE 0 — that's an *opacity* variant, not a
 * perceptual duplicate. Only genuinely different hues under the threshold are
 * "duplicate"; everything else is just the nearest.
 */
function nearKind(hex: string, near: { hex: string; deltaE: number }): NearKind {
  if (sameBaseColour(hex, near.hex) && alphaOf(hex) !== alphaOf(near.hex)) return "opacity";
  return near.deltaE < INDISTINGUISHABLE_DELTA_E ? "duplicate" : "nearest";
}

/** Graduated verdict from a redundancy count: none = good, a few = watch, more = review. */
function redundancyVerdict(n: number): Verdict {
  return n === 0 ? "good" : n <= 2 ? "watch" : "review";
}

function usageChips(count: number, totalPages: number, tokenPages?: number): string[] {
  const chips = [`${count.toLocaleString()}× used`];
  if (tokenPages != null && totalPages > 1) chips.push(`${tokenPages} ${plural(tokenPages, "page")}`);
  return chips;
}

function usageText(count: number, totalPages: number, tokenPages?: number): string {
  return usageChips(count, totalPages, tokenPages).join(" · ");
}

/** Display label for a CSS unit. */
const UNIT_LABEL: Partial<Record<CssUnit, string>> = {
  percent: "%",
  unitless: "unitless",
  clamp: "clamp()",
  calc: "calc()",
};
const unitLabel = (u: CssUnit): string => UNIT_LABEL[u] ?? u;

const CATEGORY_LABEL: Record<AuditAuthored["categories"][number]["category"], string> = {
  spacing: "Spacing",
  type: "Type",
  radius: "Radius",
  border: "Border",
};

/**
 * Whether a custom-property value is a concrete colour we can render as a swatch.
 * Skips var()/calc() forms — they can't resolve in this document, so they'd paint
 * an empty box.
 */
function colourish(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.includes("var(") || v.includes("calc(")) return false;
  return /^(#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\()/.test(v);
}

/**
 * How the site authors its tokens — read from the CSSOM, so it reflects intent
 * (`rem`, `%`, `clamp()`), not the resolved px the rest of the audit shows. The
 * accessibility flag fires when font-size is authored in px (won't respect zoom).
 * The declared custom properties are the site's own tokens, listed as shipped.
 */
function AuthoringSummary({ authored }: { authored: AuditAuthored }) {
  const [open, setOpen] = useState(false);
  const props = authored.customProperties;
  const hasContent = authored.categories.length > 0 || props.length > 0;
  if (!hasContent) return null;
  return (
    <div className={styles.authoring}>
      <Text role="label-sm" className={styles.healthKicker}>
        Authoring
      </Text>
      {authored.categories.length > 0 && (
        <div className={styles.unitRow}>
          {authored.categories.map((c) => (
            <span key={c.category} className={styles.unitChip}>
              <span className={styles.unitCat}>{CATEGORY_LABEL[c.category]}</span>
              <span className={styles.unitVal}>{c.dominant ? unitLabel(c.dominant) : "—"}</span>
            </span>
          ))}
        </div>
      )}
      {authored.typeInPx && (
        <Callout variant="warning">
          Font size is authored in <strong>px</strong> — it won&rsquo;t scale with the reader&rsquo;s
          browser font size or zoom. Prefer <strong>rem</strong>.
        </Callout>
      )}
      {props.length > 0 && (
        <div className={styles.authoredProps}>
          <button
            type="button"
            className={styles.authoredToggle}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span>
              Declares <strong>{props.length}</strong> CSS custom{" "}
              {plural(props.length, "property", "properties")} — the site&rsquo;s own tokens
            </span>
            <FontAwesomeIcon
              icon={open ? faChevronUp : faChevronDown}
              className={styles.authoredCaret}
            />
          </button>
          {open && (
            <ul className={styles.propList}>
              {props.map((p) => (
                <li key={p.name} className={styles.propRow}>
                  {colourish(p.value) && (
                    <span className={styles.propSwatch} style={{ background: p.value }} aria-hidden="true" />
                  )}
                  <code className={styles.propName}>{p.name}</code>
                  <span className={styles.propValue} title={p.value}>
                    {p.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** rem is root-relative; we assume the near-universal 16px root. */
const REM_BASE = 16;
/** px → rem, trailing zeros trimmed. */
function toRem(px: number): string {
  return `${+(px / REM_BASE).toFixed(4)}rem`;
}

/** Which unit the scalar tables show as the primary value. */
/** Which unit leads a scalar value. Both are always shown; this picks the primary. */
type DisplayUnit = "px" | "rem";


/**
 * A length value in the selected unit, with the other unit as a muted note (C2).
 * Both are always shown — px is what shipped, rem is the accessibility-relevant
 * form. `children` is the off-scale/off-grid dot, kept inside the primary span so
 * its positioning is unchanged.
 */
function LengthValue({ px, unit, children }: { px: number; unit: DisplayUnit; children?: ReactNode }) {
  const primary = unit === "px" ? `${px}px` : toRem(px);
  const alt = unit === "px" ? toRem(px) : `${px}px`;
  return (
    <span className={styles.sizeValue}>
      {primary}
      {children}
      <span className={styles.valueAlt}>{alt}</span>
    </span>
  );
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
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
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

  // The detail rail belongs to the Colour tab — leaving it closes the rail.
  useEffect(() => {
    if (tab !== "colour") setSelectedHex(null);
  }, [tab]);

  const maxSpace = audit.spacing.reduce((m, v) => Math.max(m, v.value), 1);
  const maxBp = audit.breakpoints?.reduce((m, v) => Math.max(m, v.value), 1) ?? 1;
  // ── Reference scales ────────────────────────────────────────────────────────
  // "Off-scale" is a measurement against a reference, so the reference is
  // selectable: compare the system against any named ratio, or against a 4px or
  // 8px grid. The selection drives this section's ruler and table together; the
  // Overview verdict stays pinned to the automatic best fit, so exploring a
  // hypothetical never rewrites the diagnosis.
  const typeBasePx = t.sizes.length
    ? t.sizes.reduce((a, b) => (b.count > a.count ? b : a)).px
    : 16;
  const bestRatio = useMemo(
    () => detectClosestRatio(t.sizes.map((z) => z.px), typeBasePx)?.ratio ?? null,
    [t.sizes, typeBasePx],
  );
  const [ratioId, setRatioId] = useState<string | null>(null);
  const activeRatio = RATIOS.find((r) => r.id === ratioId) ?? bestRatio;

  /** Sizes that miss a given ratio — the ruler's red dots and the table's. */
  const offScaleFor = useCallback(
    (ratio: number): Set<number> => {
      const px = t.sizes.map((z) => z.px);
      if (px.length < 2) return new Set();
      const scale = buildScaleToCover(typeBasePx, ratio, Math.min(...px), Math.max(...px));
      return new Set(classifyAgainstScale(px, scale).filter((m) => !m.onScale).map((m) => m.px));
    },
    [t.sizes, typeBasePx],
  );
  const offScalePx = useMemo(
    () => (activeRatio ? offScaleFor(activeRatio.ratio) : new Set<number>()),
    [activeRatio, offScaleFor],
  );

  const offGridFor = useCallback(
    (base: number): Set<number> => {
      const onGrid = (v: number) => Math.abs(v - Math.round(v / base) * base) <= 0.5;
      return new Set(audit.spacing.filter((sp) => !onGrid(sp.value)).map((sp) => sp.value));
    },
    [audit.spacing],
  );
  // An 8px grid is a subset of a 4px one, so "nothing misses 8" is the stronger
  // statement and the honest default when it holds.
  const detectedBase = offGridFor(8).size === 0 && audit.spacing.length > 0 ? 8 : 4;
  const [spacingBase, setSpacingBase] = useState<number | null>(null);
  const activeBase = spacingBase ?? detectedBase;
  const offGridSet = useMemo(() => offGridFor(activeBase), [offGridFor, activeBase]);
  // Radii within ~1px of a smaller one — the redundancy the audit counts.
  const radiusNearDupSet = useMemo(() => {
    const sorted = audit.radius.map((r) => r.value).sort((a, b) => a - b);
    const set = new Set<number>();
    let prev = Number.NEGATIVE_INFINITY;
    for (const v of sorted) {
      if (v - prev <= 1) set.add(v);
      prev = v;
    }
    return set;
  }, [audit.radius]);
  // Border widths within ~0.5px of a smaller one (e.g. 1px vs 1.5px).
  const borderNearDupSet = useMemo(() => {
    const sorted = (audit.borders ?? []).map((b) => b.value).sort((a, b) => a - b);
    const set = new Set<number>();
    let prev = Number.NEGATIVE_INFINITY;
    for (const v of sorted) {
      if (v - prev <= 0.5) set.add(v);
      prev = v;
    }
    return set;
  }, [audit.borders]);
  // Rank of each z-index in the stacking order — drives the ladder preview.
  const zIndexRank = useMemo(() => {
    const sorted = (audit.zIndex ?? []).map((z) => z.value).sort((a, b) => a - b);
    const map = new Map<number, number>();
    sorted.forEach((v, i) => map.set(v, i));
    return { map, total: sorted.length };
  }, [audit.zIndex]);
  // The only extended tokens with a real drift signal, for the health line:
  // redundant border widths, and a z-index set too large/ad-hoc to be a scale.
  const extendedDrift = useMemo(() => {
    const out: string[] = [];
    if (borderNearDupSet.size > 0) out.push("border widths");
    const zi = audit.zIndex ?? [];
    if (zi.length > 8 || zi.some((z) => Math.abs(z.value) >= 9999)) out.push("z-index");
    return out;
  }, [borderNearDupSet, audit.zIndex]);
  const selectedSwatch = selectedHex
    ? (audit.colourFamilies.flatMap((f) => f.swatches).find((sw) => sw.hex === selectedHex) ?? null)
    : null;

  const offScale = s.typeOffScale ?? 0;
  const offGrid = s.spacingOffGrid ?? 0;
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
            // A failing pair is a reader who can't read the page — the one
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
      verdict: redundancyVerdict(offGrid),
      chips: [offGrid > 0 ? `${offGrid} off a 4px grid` : "on a 4px grid"],
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
   * The audit as data — for machines, not readers: a CI check to assert on, two
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
        evidence: [...offScalePx].map((px) => ({ px })),
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
        evidence: [...offGridSet].map((px) => ({ px })),
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

  // Type scale rows — one per distinct size (largest first), so the table matches
  // the ruler and the tab count, with every weight and the tags that use it.
  const scaleRows = [...t.sizes].sort((a, b) => b.px - a.px);
  // Sizes that miss the closest modular scale — mirrors the ruler's red dots.

  /**
   * Lead each scalar table with the unit the site actually authors in, rather
   * than a toggle the reader has to discover. `authored` reads the real unit
   * per category off the stylesheets, so a rem-authored type scale reads in rem
   * and a px-authored one reads in px — the choice is a finding, not a setting.
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
          <>
            <div className={styles.health}>
              <Text role="label-sm" className={styles.healthKicker}>
                Design Health
              </Text>
              <Text role="heading-lg" as="p" className={styles.healthLine}>
                {healthLine(s, extendedDrift)}
              </Text>
            </div>
            <div className={styles.verdictGrid}>
              {verdicts.map((v) => {
                const id = VERDICT_TAB[v.label];
                const hasTab = id != null && tabs.some((t) => t.id === id);
                const className = `${styles.verdict} ${styles[v.verdict] ?? ""}${
                  hasTab ? ` ${styles.verdictClickable}` : ""
                }`;
                const icon = id ? TAB_ICON[id] : undefined;
                const body = (
                  <>
                    <span className={styles.verdictLabelRow}>
                      {icon && (
                        <FontAwesomeIcon icon={icon} className={styles.verdictIcon} aria-hidden="true" />
                      )}
                      <Text role="label" className={styles.verdictLabel}>
                        {v.label}
                      </Text>
                    </span>
                    <Text role="display" as="span" className={styles.verdictN}>
                      {v.n}
                    </Text>
                    <div className={styles.pills}>
                      {v.chips.map((c) => (
                        <span key={c} className={styles.pill}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </>
                );
                return hasTab ? (
                  <button key={v.label} type="button" className={className} onClick={() => setTab(id)}>
                    {body}
                  </button>
                ) : (
                  <div key={v.label} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
            {audit.authored && <AuthoringSummary authored={audit.authored} />}
          </>
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
          <>
            <Text role="label-sm" as="h3" className={styles.sectionLabel}>
              Families
            </Text>
            <div className={styles.familyList}>
              {t.families.map((f) => (
                <div key={f.family} className={styles.familyRow}>
                  <span className={styles.familyRowGlyph} style={{ fontFamily: `'${f.family}', var(--font-sans)` }}>
                    Ag
                  </span>
                  <span className={styles.familyRowName}>{f.family}</span>
                  <span className={styles.pill}>{usageText(f.count, s.pages)}</span>
                </div>
              ))}
            </div>

            <TypeRuler
              sizes={t.sizes}
              activeRatio={activeRatio}
              bestRatioId={bestRatio?.id ?? null}
              offCountFor={(ratio) => offScaleFor(ratio).size}
              onSelect={setRatioId}
            />

            <Table head={["Scale", "Size", "Weight", "Tags", "Uses"]}>
              {scaleRows.map((r) => {
                const off = offScalePx.has(r.px);
                // Guard against an older backend that omits weights/tags per size.
                const weights = r.weights ?? [];
                const tags = r.tags ?? [];
                return (
                  <tr key={r.px}>
                    <td className={styles.typeScaleCell}>
                      <span
                        className={styles.typeSpecimen}
                        style={{ fontSize: `${Math.min(r.px, 32)}px`, fontWeight: weights[0], fontFamily: fontStack }}
                      >
                        Ag
                      </span>
                    </td>
                    <td className={styles.valueCell}>
                      <LengthValue px={r.px} unit={unitFor("type")}>
                        {off && <span className={styles.offScaleDot} title="Off the closest scale" />}
                      </LengthValue>
                    </td>
                    <td className={styles.valueCell}>
                      {weights.length ? [...weights].sort((a, b) => a - b).join(" · ") : "—"}
                    </td>
                    <td className={styles.tagsCell}>
                      <span className={styles.tagChips}>
                        {tags.map((tg) => (
                          <span key={tg.tag} className={styles.tagChip} title={`${tg.count.toLocaleString()}×`}>
                            {tg.tag}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className={styles.usageCell}>{r.count.toLocaleString()}×</td>
                  </tr>
                );
              })}
            </Table>
          </>
        )}

        {tab === "spacing" && (
          <>
            <SpacingRuler
              values={audit.spacing.map((v) => v.value)}
              base={activeBase}
              detectedBase={detectedBase}
              offCountFor={(b) => offGridFor(b).size}
              onSelect={setSpacingBase}
            />
            <Table
              head={["Preview", "Value", "Attribute", "Tags", "Uses"]}
            >
            {audit.spacing.map((v) => (
              <tr key={v.value}>
                <td className={styles.spacingPreviewCell}>
                  <span className={styles.bar} style={{ width: `${Math.max((v.value / maxSpace) * 100, 4)}%` }} />
                </td>
                <td className={styles.valueCell}>
                  <LengthValue px={v.value} unit={unitFor("spacing")}>
                    {offGridSet.has(v.value) && <span className={styles.offScaleDot} title="Off the 4px grid" />}
                  </LengthValue>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(v.properties ?? []).map((p) => (
                      <span key={p.property} className={styles.tagChip} title={`${p.count.toLocaleString()}×`}>
                        {p.property}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(v.tags ?? []).map((tg) => (
                      <span key={tg.tag} className={styles.tagChip} title={`${tg.count.toLocaleString()}×`}>
                        {tg.tag}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.usageCell}>{v.count.toLocaleString()}×</td>
              </tr>
            ))}
            </Table>
          </>
        )}

        {tab === "radius" && (
          <Table head={["Preview", "Value", "Tags", "Uses"]}>
            {audit.radius.map((v) => (
              <tr key={v.value}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.radiusChip} style={{ borderRadius: `${v.value}px` }} />
                </td>
                <td className={styles.valueCell}>
                  <LengthValue px={v.value} unit={unitFor("radius")}>
                    {radiusNearDupSet.has(v.value) && (
                      <span className={styles.offScaleDot} title="Near-duplicate of another radius" />
                    )}
                  </LengthValue>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(v.tags ?? []).map((tg) => (
                      <span key={tg.tag} className={styles.tagChip} title={`${tg.count.toLocaleString()}×`}>
                        {tg.tag}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.usageCell}>{v.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "shadow" && (
          <Table head={["Preview", "Value", "Tags", "Uses"]}>
            {audit.shadow.map((sh, i) => (
              <tr key={i}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.shadowChip} style={{ boxShadow: sh.value }} />
                </td>
                <td className={`${styles.valueCell} ${styles.valueCellTrunc}`} title={sh.value}>
                  {sh.value}
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(sh.tags ?? []).map((tg) => (
                      <span key={tg.tag} className={styles.tagChip} title={`${tg.count.toLocaleString()}×`}>
                        {tg.tag}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.usageCell}>{sh.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "gradient" && audit.gradients && (
          <Table head={["Preview", "Value", "Tags", "Uses"]}>
            {audit.gradients.map((g, i) => (
              <tr key={i}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.gradientSwatch} style={{ backgroundImage: g.value }} />
                </td>
                <td className={`${styles.valueCell} ${styles.valueCellTrunc}`} title={g.value}>
                  {g.value}
                </td>
                <TagsCell tags={g.tags} />
                <td className={styles.usageCell}>{g.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "border" && audit.borders && (
          <Table head={["Preview", "Value", "Sides", "Tags", "Uses"]}>
            {audit.borders.map((b) => (
              <tr key={b.value}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.borderChip} style={{ borderWidth: `${b.value}px` }} />
                </td>
                <td className={styles.valueCell}>
                  <LengthValue px={b.value} unit={unitFor("border")}>
                    {borderNearDupSet.has(b.value) && (
                      <span className={styles.offScaleDot} title="Near-duplicate of another width" />
                    )}
                  </LengthValue>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(b.sides ?? []).map((s) => (
                      <span key={s.side} className={styles.tagChip} title={`${s.count.toLocaleString()}×`}>
                        {s.side}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(b.tags ?? []).map((tg) => (
                      <span key={tg.tag} className={styles.tagChip} title={`${tg.count.toLocaleString()}×`}>
                        {tg.tag}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.usageCell}>{b.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "contrast" && audit.contrast && (
          <Table head={["Sample", "Pair", "Ratio", "WCAG", "Tags", "Uses"]}>
            {audit.contrast.map((c) => (
              <tr key={`${c.foreground}|${c.background}`}>
                <td className={styles.chipPreviewCell}>
                  <span
                    className={styles.contrastSample}
                    style={{ background: c.background, color: c.foreground }}
                  >
                    Aa
                  </span>
                </td>
                <td className={styles.valueCell}>
                  <span className={styles.contrastPair}>
                    {c.foreground}
                    <span className={styles.contrastOn}>on</span>
                    {c.background}
                  </span>
                </td>
                <td className={styles.valueCell}>{c.ratio.toFixed(2)}:1</td>
                <td>
                  <Badge variant={c.passAA ? "neutral" : "danger"}>
                    {c.passAAA ? "AAA" : c.passAA ? "AA" : c.passAALarge ? "AA large only" : "Fails AA"}
                  </Badge>
                </td>
                <TagsCell tags={c.sampleTags} />
                <td className={styles.usageCell}>{c.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "opacity" && audit.opacity && (
          <Table head={["Preview", "Value", "Tags", "Uses"]}>
            {audit.opacity.map((o) => (
              <tr key={o.value}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.checker}>
                    <span className={styles.opacityFill} style={{ opacity: o.value }} />
                  </span>
                </td>
                <td className={styles.valueCell}>{o.value.toFixed(2)}</td>
                <TagsCell tags={o.tags} />
                <td className={styles.usageCell}>{o.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "zindex" && audit.zIndex && (
          <Table head={["Layer", "Value", "Tags", "Uses"]}>
            {audit.zIndex.map((z) => (
              <tr key={z.value}>
                <td className={styles.chipPreviewCell}>
                  <ZIndexLadder rank={zIndexRank.map.get(z.value) ?? 0} total={zIndexRank.total} />
                </td>
                <td className={styles.valueCell}>{z.value}</td>
                <TagsCell tags={z.tags} />
                <td className={styles.usageCell}>{z.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "blur" && audit.blur && (
          <Table head={["Preview", "Value", "Tags", "Uses"]}>
            {audit.blur.map((b) => (
              <tr key={b.value}>
                <td className={styles.chipPreviewCell}>
                  <span className={styles.blurStage}>
                    <span className={styles.blurGlass} style={{ backdropFilter: `blur(${b.value}px)`, WebkitBackdropFilter: `blur(${b.value}px)` }} />
                  </span>
                </td>
                <td className={styles.valueCell}>{b.value}px</td>
                <TagsCell tags={b.tags} />
                <td className={styles.usageCell}>{b.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "breakpoint" && audit.breakpoints && (
          <Table head={["Preview", "Value", "Device", "Query", "Uses"]}>
            {audit.breakpoints.map((bp) => (
              <tr key={bp.value}>
                <td className={styles.spacingPreviewCell}>
                  <span className={styles.bpScreen} style={{ width: `${Math.max((bp.value / maxBp) * 100, 10)}%` }} />
                </td>
                <td className={styles.valueCell}>{bp.value}px</td>
                <td className={styles.valueCell}>
                  <span className={styles.tagChip}>{deviceClass(bp.value)}</span>
                </td>
                <td className={styles.tagsCell}>
                  <span className={styles.tagChips}>
                    {(bp.types ?? []).map((t) => (
                      <span key={t.type} className={styles.tagChip} title={`${t.count.toLocaleString()}×`}>
                        {t.type}-width
                      </span>
                    ))}
                  </span>
                </td>
                <td className={styles.usageCell}>{bp.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "motion" && audit.motion && (
          <>
            <Table head={["Preview", "Duration", "Tags", "Uses"]} className={styles.motionTable}>
              {audit.motion.durations.map((d) => (
                <tr key={d.value}>
                  <td className={styles.specimenCell}>
                    <span className={styles.motionTrack} style={{ ["--dur" as string]: `${d.value}ms` }}>
                      <span className={styles.motionDot} />
                    </span>
                  </td>
                  <td className={styles.valueCell}>{d.value}ms</td>
                  <TagsCell tags={d.tags} />
                  <td className={styles.usageCell}>{d.count.toLocaleString()}×</td>
                </tr>
              ))}
            </Table>

            <Table head={["Preview", "Easing", "Tags", "Uses"]} className={styles.motionTable}>
              {audit.motion.easings.map((e) => (
                <tr key={e.value}>
                  <td className={styles.specimenCell}>
                    <span className={styles.motionTrack} style={{ ["--ease" as string]: e.value }}>
                      <span className={styles.easingDot} />
                    </span>
                  </td>
                  <td className={`${styles.valueCell} ${styles.valueCellWrap}`}>{e.value}</td>
                  <TagsCell tags={e.tags} />
                  <td className={styles.usageCell}>{e.count.toLocaleString()}×</td>
                </tr>
              ))}
            </Table>
          </>
        )}
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

/** A table with a header row and divider lines, used by every scalar token tab. */
/**
 * Every inventory table. Wrapped in an overflow-x container so a wide row —
 * a long shadow string, a site with many element tags — scrolls inside the
 * panel instead of stretching the page.
 */
function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={className ? `${styles.table} ${className}` : styles.table}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === head.length - 1 ? styles.thRight : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Stacking-order preview for z-index — offset layers, taller = higher in the stack. */
function ZIndexLadder({ rank, total }: { rank: number; total: number }) {
  const layers = Math.min(rank + 1, 5);
  return (
    <span className={styles.zLadder} title={`Layer ${rank + 1} of ${total}`}>
      {Array.from({ length: layers }).map((_, i) => (
        <span
          key={i}
          className={i === layers - 1 ? `${styles.zLayer} ${styles.zLayerTop}` : styles.zLayer}
          style={{ left: `${i * 6}px`, bottom: `${i * 5}px` }}
        />
      ))}
    </span>
  );
}

/** Rough device class for a breakpoint width. */
function deviceClass(px: number): string {
  if (px < 640) return "mobile";
  if (px < 1024) return "tablet";
  return "desktop";
}

/** A table cell of element-tag chips — the shared attribution column. */
/** Beyond this the chips stop informing and start pushing the row taller. */
const MAX_TAG_CHIPS = 8;

/**
 * Element tags for a row. Accepts counted tags (most tables) or bare tag names
 * (contrast pairs). Caps the visible chips so a site that uses one value on
 * thirty element types doesn't turn one row into a paragraph — the rest are
 * summarised in a titled "+N" chip.
 */
function TagsCell({ tags }: { tags?: ({ tag: string; count: number } | string)[] }) {
  const all = (tags ?? []).map((t) => (typeof t === "string" ? { tag: t, count: null } : t));
  const shown = all.slice(0, MAX_TAG_CHIPS);
  const rest = all.slice(MAX_TAG_CHIPS);
  return (
    <td className={styles.tagsCell}>
      <span className={styles.tagChips}>
        {shown.map((tg) => (
          <span
            key={tg.tag}
            className={styles.tagChip}
            title={tg.count != null ? `${tg.count.toLocaleString()}×` : undefined}
          >
            {tg.tag}
          </span>
        ))}
        {rest.length > 0 && (
          <span className={styles.tagChip} title={rest.map((t) => t.tag).join(", ")}>
            +{rest.length}
          </span>
        )}
      </span>
    </td>
  );
}

/**
 * Type scale ruler — the visual evidence for the "off-scale" verdict. Sizes are
 * plotted on a log axis against the closest modular scale's steps; sizes that
 * miss a step sit between ticks in red.
 */
function TypeRuler({
  sizes,
  activeRatio,
  bestRatioId,
  offCountFor,
  onSelect,
}: {
  sizes: { px: number; count: number }[];
  activeRatio: { id: string; name: string; ratio: number } | null;
  bestRatioId: string | null;
  offCountFor: (ratio: number) => number;
  onSelect: (id: string) => void;
}) {
  if (sizes.length < 2 || !activeRatio) return null;
  const px = sizes.map((s) => s.px);
  const base = sizes.reduce((a, b) => (b.count > a.count ? b : a)).px;

  const scale = buildScaleToCover(base, activeRatio.ratio, Math.min(...px), Math.max(...px));
  const marks = classifyAgainstScale(px, scale);
  const lo = Math.log(scale[0]!.px);
  const hi = Math.log(scale.at(-1)!.px);
  const pos = (v: number) => (hi > lo ? ((Math.log(v) - lo) / (hi - lo)) * 100 : 50);
  const off = marks.filter((m) => !m.onScale).length;

  return (
    <Ruler
      title={`${activeRatio.name} (×${activeRatio.ratio})${activeRatio.id === bestRatioId ? " · closest" : ""}`}
      note={off > 0 ? `${off} off-scale` : "all on scale"}
      ticks={scale.map((s) => ({ px: s.px, pos: pos(s.px) }))}
      dots={marks.map((m) => ({ px: m.px, pos: pos(m.px), on: m.onScale, nearest: m.nearestPx }))}
      options={
        <ScaleOptions
          options={RATIOS.map((r) => ({
            id: r.id,
            label: r.name,
            off: offCountFor(r.ratio),
            best: r.id === bestRatioId,
          }))}
          activeId={activeRatio.id}
          onSelect={onSelect}
        />
      }
    />
  );
}

/**
 * The reference-scale picker. Each option carries how many values miss it, so
 * the row itself answers "which scale is this system actually on?" — picking is
 * secondary to comparing.
 */
function ScaleOptions({
  options,
  activeId,
  onSelect,
}: {
  options: { id: string; label: string; off: number; best?: boolean }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.scaleOptions} role="tablist" aria-label="Compare against scale">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === activeId}
          className={o.id === activeId ? `${styles.scaleChip} ${styles.scaleChipOn}` : styles.scaleChip}
          onClick={() => onSelect(o.id)}
        >
          <span>{o.label}</span>
          <span className={styles.scaleChipCount}>{o.off === 0 ? "all on" : `${o.off} off`}</span>
        </button>
      ))}
    </div>
  );
}

/** A "nice" round step (1/2/5 × 10ⁿ) near the target, for readable axis labels. */
function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** Spacing grid ruler — values on a linear axis against the 4px grid. */
function SpacingRuler({
  values,
  base,
  detectedBase,
  offCountFor,
  onSelect,
}: {
  values: number[];
  base: number;
  detectedBase: number;
  offCountFor: (base: number) => number;
  onSelect: (base: number) => void;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, base);
  const gridStep = max / base > 24 ? base * 2 : base;
  // Keep the grid ticks for normal ranges; only when they'd smear into an
  // unreadable strip (a large range) fall back to ~10 round ticks.
  const step = max / gridStep > 24 ? niceStep(max / 12) : gridStep;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(Math.round(v));

  const onGrid = (v: number) => Math.abs(v - Math.round(v / base) * base) <= 0.5;
  const pos = (v: number) => (max > 0 ? (v / max) * 100 : 0);
  const off = values.filter((v) => !onGrid(v)).length;

  return (
    <Ruler
      title={`${base}px grid${base === detectedBase ? " · detected" : ""}`}
      note={off > 0 ? `${off} off grid` : "all on grid"}
      ticks={ticks.map((t) => ({ px: t, pos: pos(t) }))}
      dots={values.map((v) => ({ px: v, pos: pos(v), on: onGrid(v) }))}
      options={
        <ScaleOptions
          options={[4, 8].map((b) => ({
            id: String(b),
            label: `${b}px grid`,
            off: offCountFor(b),
            best: b === detectedBase,
          }))}
          activeId={String(base)}
          onSelect={(id) => onSelect(Number(id))}
        />
      }
    />
  );
}

interface RulerMark {
  px: number;
  pos: number;
  on?: boolean;
  nearest?: number;
}

function Ruler({
  title,
  note,
  ticks,
  dots,
  options,
}: {
  title: string;
  note: string;
  ticks: { px: number; pos: number }[];
  dots: RulerMark[];
  /** Reference-scale picker, shown under the track. */
  options?: ReactNode;
}) {
  return (
    <div className={styles.ruler}>
      <div className={styles.rulerHead}>
        <Text role="label-sm" className={styles.rulerTitle}>
          {title}
        </Text>
        <Text role="label-xs" className={styles.rulerNote}>
          {note}
        </Text>
      </div>
      <div className={styles.rulerTrack}>
        <div className={styles.rulerLine} />
        {ticks.map((t) => (
          <span key={`t${t.px}`} className={styles.rulerTick} style={{ left: `${t.pos}%` }}>
            <span className={styles.rulerTickLabel}>{t.px}</span>
          </span>
        ))}
        {dots.map((d) => (
          <span
            key={`d${d.px}`}
            className={d.on ? styles.rulerDot : `${styles.rulerDot} ${styles.rulerDotOff}`}
            style={{ left: `${d.pos}%` }}
            title={`${d.px}px${d.on ? "" : d.nearest != null ? ` · off scale (nearest ${d.nearest})` : " · off grid"}`}
          />
        ))}
      </div>
      {options}
    </div>
  );
}

function ColourCard({
  sw,
  id,
  selected,
  flash,
  onSelect,
}: {
  sw: AuditColourSwatch;
  id: string;
  selected: boolean;
  flash: boolean;
  onSelect: () => void;
}) {
  // Thinned card: just the value, headline usage, and a flag when it perceptually
  // duplicates another hue. Role split, pages, and elements live in the rail.
  const isDup = sw.nearest != null && nearKind(sw.hex, sw.nearest) === "duplicate";
  return (
    <button
      type="button"
      id={id}
      className={`${styles.card} ${styles.cardBtn}${selected ? ` ${styles.cardOn}` : ""}${
        flash ? ` ${styles.cardFlash}` : ""
      }`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.swatchFill} style={{ background: sw.hex }} />
      <span className={styles.cardMeta}>
        <Text role="mono" className={styles.cardValue}>
          {sw.hex.toUpperCase()}
        </Text>
        <span className={styles.pills}>
          <span className={styles.pill}>{sw.count.toLocaleString()}× used</span>
          {isDup && <span className={`${styles.pill} ${styles.pillDup}`}>≈ ΔE {sw.nearest!.deltaE}</span>}
        </span>
      </span>
    </button>
  );
}

const ROLE_ORDER = [
  { key: "background" as const, short: "bg", label: "Background" },
  { key: "text" as const, short: "text", label: "Text" },
  { key: "border" as const, short: "border", label: "Border" },
];

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** The drawer header: the swatch, its hex, and headline usage. */
function ColourDrawerTitle({ sw, totalPages }: { sw: AuditColourSwatch; totalPages: number }) {
  return (
    <div className={styles.drawerTitle}>
      <span className={styles.drawerSwatch} style={{ background: sw.hex }} />
      <div>
        <Text role="heading-sm" as="span" className={styles.drawerHex}>
          {sw.hex.toUpperCase()}
        </Text>
        <Text role="label-xs" className={styles.muted}>
          {usageText(sw.count, totalPages, sw.pages.length)}
        </Text>
      </div>
    </div>
  );
}

/** One related-colour row: swatch, relationship label, and ΔE or opacity. */
function NearCallout({
  hex,
  kind,
  deltaE,
  onPick,
}: {
  hex: string;
  kind: NearKind;
  deltaE: number;
  onPick: (hex: string) => void;
}) {
  const label =
    kind === "opacity"
      ? "Same colour, different opacity"
      : kind === "duplicate"
        ? "Indistinguishable from"
        : "Nearest colour";
  return (
    <button
      type="button"
      className={kind === "duplicate" ? `${styles.nearCallout} ${styles.nearDup}` : styles.nearCallout}
      onClick={() => onPick(hex)}
    >
      <span className={styles.nearSwatchWrap}>
        <span className={styles.nearSwatch} style={{ background: hex }} />
      </span>
      <span className={styles.nearText}>
        <Text role="body-sm">{label}</Text>
        <Text role="mono" className={styles.nearHex}>
          {hex.toUpperCase()}
        </Text>
      </span>
      <Text role="mono" className={styles.nearDelta}>
        {kind === "opacity" ? `${Math.round(alphaOf(hex) * 100)}%` : `ΔE ${deltaE}`}
      </Text>
    </button>
  );
}

/** Drawer content for a colour: related colours, roles, elements, pages. */
function ColourDetail({
  sw,
  totalPages,
  onPick,
}: {
  sw: AuditColourSwatch;
  totalPages: number;
  onPick: (hex: string) => void;
}) {
  const roles = ROLE_ORDER.map((r) => ({ label: r.label, n: sw.roles[r.key] })).filter((r) => r.n > 0);
  const total = roles.reduce((n, r) => n + r.n, 0) || 1;
  const elements = sw.elements ?? [];

  // Elements are ranked by frequency by default; the toggle groups them by tag
  // (all `a`, all `div`…), tags in alphabetical order for quick scanning.
  const [grouped, setGrouped] = useState(false);
  const elementGroups = useMemo(() => {
    const map = new Map<string, { tag: string; total: number; rows: typeof elements }>();
    for (const e of elements) {
      const g = map.get(e.tag) ?? { tag: e.tag, total: 0, rows: [] };
      g.total += e.count;
      g.rows.push(e);
      map.set(e.tag, g);
    }
    return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  }, [elements]);

  // Show every relationship — all opacity variants and near-duplicates — not just
  // the single closest. Fall back to the one nearest colour only when it's close
  // enough to matter; a colour whose nearest is far (white ↔ black, ΔE 100) stands
  // alone and gets no call-out.
  const near = sw.nearest;
  const relations: { hex: string; kind: NearKind; deltaE: number }[] =
    sw.related && sw.related.length > 0
      ? sw.related.map((r) => ({
          hex: r.hex,
          kind: r.opacityVariant ? "opacity" : "duplicate",
          deltaE: r.deltaE,
        }))
      : near && near.deltaE < NEAREST_DELTA_E
        ? [{ hex: near.hex, kind: nearKind(sw.hex, near), deltaE: near.deltaE }]
        : [];

  return (
    <div className={styles.drawerContent}>
      {relations.length > 0 && (
        <div className={styles.relatedList}>
          {relations.map((r) => (
            <NearCallout key={r.hex} hex={r.hex} kind={r.kind} deltaE={r.deltaE} onPick={onPick} />
          ))}
        </div>
      )}

      <div className={styles.detailSection}>
        <Text role="label-xs" className={styles.detailLabel}>
          Roles
        </Text>
        <div className={styles.roleBars}>
          {roles.map((r) => (
            <div key={r.label} className={styles.roleRow}>
              <span className={styles.roleName}>{r.label}</span>
              <span className={styles.roleTrack}>
                <span className={styles.roleFill} style={{ width: `${(r.n / total) * 100}%` }} />
              </span>
              <span className={styles.rolePct}>{Math.round((r.n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {elements.length > 0 && (
        <div className={styles.detailSection}>
          <div className={styles.detailHead}>
            <Text role="label-xs" className={styles.detailLabel}>
              Used by {elements.length} element {elements.length === 1 ? "type" : "types"}
            </Text>
            {elementGroups.length < elements.length && (
              <button
                type="button"
                className={grouped ? `${styles.sortToggle} ${styles.sortToggleOn}` : styles.sortToggle}
                aria-pressed={grouped}
                title={grouped ? "Sort by frequency" : "Group by element"}
                onClick={() => setGrouped((g) => !g)}
              >
                <FontAwesomeIcon icon={faLayerGroup} />
              </button>
            )}
          </div>
          <div className={styles.elementList}>
            {grouped
              ? elementGroups.map((g) => (
                  <div key={g.tag} className={styles.elementGroup}>
                    <div className={styles.elementGroupHead}>
                      <Text role="mono" className={styles.elementTag}>
                        {g.tag}
                      </Text>
                      <span className={styles.elementCount}>{g.total.toLocaleString()}×</span>
                    </div>
                    {g.rows.map((e) => (
                      <div key={`${e.tag}|${e.role}`} className={styles.elementSubRow}>
                        <span className={styles.elementRole}>{e.role}</span>
                        <span className={styles.elementCount}>{e.count.toLocaleString()}×</span>
                      </div>
                    ))}
                  </div>
                ))
              : elements.map((e) => (
                  <div key={`${e.tag}|${e.role}`} className={styles.elementRow}>
                    <Text role="mono" className={styles.elementTag}>
                      {e.tag}
                    </Text>
                    <span className={styles.elementRole}>{e.role}</span>
                    <span className={styles.elementCount}>{e.count.toLocaleString()}×</span>
                  </div>
                ))}
          </div>
        </div>
      )}

      <div className={styles.detailSection}>
        <Text role="label-xs" className={styles.detailLabel}>
          On {sw.pages.length} {totalPages > 1 ? `of ${totalPages} ` : ""}
          {sw.pages.length === 1 ? "page" : "pages"}
        </Text>
        <div className={styles.pageChips}>
          {sw.pages.map((p) => (
            <span key={p} className={styles.pageChip}>
              {pathOf(p)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
