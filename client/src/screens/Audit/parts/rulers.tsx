/**
 * The rulers behind the two "off" verdicts.
 *
 * A count of what misses a reference is a claim; the ruler is the evidence for
 * it. Sizes are plotted against the closest modular scale on a log axis,
 * spacings against the grid on a linear one, and anything that misses sits
 * between ticks in red.
 *
 * Both references are selectable, because "off-scale" is only meaningful
 * relative to something and a reader should be able to test another candidate.
 * The selection drives the ruler and its table together and nothing else — the
 * verdict and the export stay pinned to the automatic fit, so exploring a
 * hypothesis never rewrites the diagnosis.
 */

import type { ReactNode } from "react";
import { RATIOS, buildScaleToCover, classifyAgainstScale } from "../../../lib/typeScale.js";
import { niceStep } from "../auditModel.js";
import styles from "../Audit.module.css";

/**
 * Type scale ruler — the visual evidence for the "off-scale" verdict. Sizes are
 * plotted on a log axis against the closest modular scale's steps; sizes that
 * miss a step sit between ticks in red.
 */
export function TypeRuler({
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

  return (
    <Ruler
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
          bestLabel="closest"
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
export function ScaleOptions({
  options,
  activeId,
  bestLabel,
  onSelect,
}: {
  options: { id: string; label: string; off: number; best?: boolean }[];
  activeId: string;
  /** What to call the automatic pick — "closest" for a ratio, "detected" for a grid. */
  bestLabel: string;
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
          {o.best && <span className={styles.scaleChipBest}>{bestLabel}</span>}
        </button>
      ))}
    </div>
  );
}

/** A "nice" round step (1/2/5 × 10ⁿ) near the target, for readable axis labels. */
/** Spacing grid ruler — values on a linear axis against the 4px grid. */
export function SpacingRuler({
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

  return (
    <Ruler
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
          bestLabel="detected"
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

export function Ruler({
  ticks,
  dots,
  options,
}: {
  ticks: { px: number; pos: number }[];
  dots: RulerMark[];
  /**
   * Reference-scale picker. It heads the ruler rather than sitting under it:
   * each option already names the scale and its off-count, so a separate title
   * and note would say the same thing twice.
   */
  options?: ReactNode;
}) {
  return (
    <div className={styles.ruler}>
      {options}
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
    </div>
  );
}
