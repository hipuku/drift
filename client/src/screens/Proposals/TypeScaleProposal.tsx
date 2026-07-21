/**
 * Type-scale proposal (Layer 2, "what it could be") with Apply.
 *
 * Seeds canonical modular scales from the site's *detected* base size and
 * renders a specimen ladder in the site's actual font. Pick a ratio, hit Apply,
 * and the ladder swaps from the site's current ad-hoc sizes to the proposed
 * scale; off-scale current sizes are flagged. Export the proposed scale as
 * CSS / Tailwind / DTCG. Fully deterministic.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import {
  RATIOS,
  buildScaleToCover,
  classifyAgainstScale,
  detectClosestRatio,
  exportScale,
  type TypeInventory,
} from "../../lib/typeScale.js";
import styles from "./TypeScaleProposal.module.css";

const SAMPLE = "Design systems drift over time";

interface Props {
  inventory: TypeInventory;
  /** Optional path back to the report; omitted in the dev harness. */
  onBack?: () => void;
}

export function TypeScaleProposal({ inventory, onBack }: Props) {
  const basePx = inventory.baseSizePx ?? 16;
  const family = inventory.primaryFamily;
  const currentSizes = useMemo(() => inventory.sizes.map((s) => s.px), [inventory.sizes]);

  const closest = useMemo(() => detectClosestRatio(currentSizes, basePx), [currentSizes, basePx]);
  const [ratioId, setRatioId] = useState(closest?.ratio.id ?? "major-third");
  const [applied, setApplied] = useState(false);

  const ratio = RATIOS.find((r) => r.id === ratioId) ?? RATIOS[1]!;

  const min = currentSizes.length ? Math.min(...currentSizes) : basePx;
  const max = currentSizes.length ? Math.max(...currentSizes) : basePx;
  const scale = useMemo(
    () => buildScaleToCover(basePx, ratio.ratio, min, max),
    [basePx, ratio.ratio, min, max],
  );

  const classification = useMemo(
    () => new Map(classifyAgainstScale(currentSizes, scale).map((c) => [c.px, c])),
    [currentSizes, scale],
  );

  const fontStack = family ? `'${family}', var(--font-sans)` : "var(--font-sans)";

  // Rows: proposed scale (largest first) when applied, else current sizes.
  const rows = applied
    ? scale.slice().reverse().map((s) => ({ key: `p${s.step}`, px: s.px, label: s.name, off: false }))
    : currentSizes
        .slice()
        .reverse()
        .map((px) => ({ key: `c${px}`, px, label: `${px}px`, off: !classification.get(px)?.onScale }));

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to proposals
          </button>
        )}
        <Text role="heading-lg" as="h1">
          What your type could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          Base <strong>{basePx}px</strong>
          {family ? <> · <span className={styles.fam}>{family}</span></> : null}
          {closest ? <> · currently closest to <strong>{closest.ratio.name}</strong></> : null}
        </Text>
      </header>

      {/* Ratio picker */}
      <div className={styles.ratios} role="radiogroup" aria-label="Modular scale">
        {RATIOS.map((r) => {
          const active = r.id === ratioId;
          const isClosest = closest?.ratio.id === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? `${styles.ratio} ${styles.ratioOn}` : styles.ratio}
              onClick={() => setRatioId(r.id)}
            >
              <Text role="label">{r.name}</Text>
              <Text role="mono" className={styles.ratioVal}>
                {r.ratio}
              </Text>
              {isClosest && <span className={styles.closest}>closest</span>}
            </button>
          );
        })}
      </div>

      {/* Apply toggle */}
      <div className={styles.applyRow}>
        <div className={styles.toggle} role="tablist" aria-label="Preview">
          <button
            type="button"
            role="tab"
            aria-selected={!applied}
            className={!applied ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => setApplied(false)}
          >
            Current
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={applied}
            className={applied ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => setApplied(true)}
          >
            Proposed
          </button>
        </div>
        <Text role="label-sm" className={styles.applyHint}>
          {applied ? `${ratio.name} scale applied` : "Showing the site's current sizes"}
        </Text>
      </div>

      {/* Specimen ladder */}
      <div className={styles.ladder}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <div className={styles.rowMeta}>
              <Text role="mono" className={styles.rowLabel}>
                {row.label}
              </Text>
              {row.off && <Badge variant="warning">off-scale</Badge>}
            </div>
            <div
              className={styles.specimen}
              style={{ fontSize: `${row.px}px`, fontFamily: fontStack }}
            >
              {SAMPLE}
            </div>
          </div>
        ))}
      </div>

      {/* Export */}
      <ExportPanel render={(format) => exportScale(scale, format)} />
    </main>
  );
}
