/**
 * Spacing proposal (Layer 2, "what it could be") — snap to a base grid.
 *
 * Detects the base unit the site's spacing is already closest to (4 vs 8px),
 * builds a clean ramp covering the observed range, and renders a scale of
 * bars. Toggle Current↔Proposed: Current shows the site's ad-hoc values with
 * off-grid ones flagged (and the step they'd snap to); Proposed shows the clean
 * ramp. Export as CSS vars / Tailwind spacing / DTCG. Fully deterministic.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditSpacingUsage } from "../../lib/api.js";
import { exportTokens, type TokenEntry, type TokenGroup } from "../../lib/exportTokens.js";
import { robustMax } from "../../lib/stats.js";
import {
  BASE_UNITS,
  buildGridToCover,
  classifyAgainstGrid,
  detectBaseUnit,
  type BaseUnit,
} from "../../lib/spacingScale.js";
import styles from "./SpacingProposal.module.css";

const GROUP: TokenGroup = { group: "space", type: "dimension", tailwindKey: "spacing" };

interface Props {
  spacing: AuditSpacingUsage[];
  onBack?: () => void;
}

export function SpacingProposal({ spacing, onBack }: Props) {
  const values = useMemo(() => spacing.map((s) => s.value).filter((v) => v > 0), [spacing]);

  const detected = useMemo(() => detectBaseUnit(values), [values]);
  const [base, setBase] = useState<BaseUnit>(detected?.base ?? 8);
  const [applied, setApplied] = useState(false);

  // Cover the range the site genuinely uses — a usage-weighted ceiling so a
  // stray outlier (a mis-captured max-width) can't extend the ramp past reality.
  const ceiling = useMemo(() => robustMax(spacing.map((s) => ({ value: s.value, count: s.count }))), [spacing]);
  const grid = useMemo(() => buildGridToCover(base, ceiling || base), [base, ceiling]);

  const classification = useMemo(
    () => new Map(classifyAgainstGrid(values, grid).map((c) => [c.px, c])),
    [values, grid],
  );

  const offGrid = values.filter((px) => !classification.get(px)?.onGrid).length;

  // Bars scale to the ramp's top; values above it (outliers) clip at full width,
  // reading honestly as "off the chart".
  const railMax = grid[grid.length - 1]?.px ?? base;

  const exportEntries: TokenEntry[] = grid.map((s) => ({ name: `${s.multiple}`, value: s.rem, unit: "rem" }));

  // Rows: proposed ramp when applied, else the site's current values.
  const rows = applied
    ? grid.map((s) => ({ key: `p${s.multiple}`, px: s.px, label: `${s.px}px`, sub: s.name, off: false, snapTo: "" }))
    : values
        .slice()
        .sort((a, b) => a - b)
        .map((px) => {
          const c = classification.get(px);
          return {
            key: `c${px}`,
            px,
            label: `${px}px`,
            sub: `used ${spacing.find((s) => s.value === px)?.count ?? 0}×`,
            off: !c?.onGrid,
            snapTo: c && !c.onGrid ? `→ ${c.nearestPx}px` : "",
          };
        });

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to proposals
          </button>
        )}
        <Text role="heading-lg" as="h1">
          What your spacing could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          <strong>{values.length}</strong> distinct spacing value{values.length === 1 ? "" : "s"}
          {detected ? (
            <>
              {" "}
              · closest to a <strong>{detected.base}px</strong> grid
            </>
          ) : null}
          {offGrid > 0 ? (
            <>
              {" "}
              · <strong>{offGrid}</strong> sit off it
            </>
          ) : null}
          .
        </Text>
      </header>

      {/* Base-unit picker */}
      <div className={styles.bases} role="radiogroup" aria-label="Base unit">
        {BASE_UNITS.map((u) => {
          const active = u === base;
          const isDetected = detected?.base === u;
          return (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? `${styles.baseBtn} ${styles.baseOn}` : styles.baseBtn}
              onClick={() => setBase(u)}
            >
              <Text role="label">{u}px grid</Text>
              <Text role="mono" className={styles.baseVal}>
                {u}·n
              </Text>
              {isDetected && <span className={styles.detected}>detected</span>}
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
          {applied ? `${base}px grid applied` : "Showing the site's current values"}
        </Text>
      </div>

      {/* Spacing rail */}
      <div className={styles.ladder}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <div className={styles.rowMeta}>
              <Text role="mono" className={styles.rowLabel}>
                {row.label}
              </Text>
              <Text role="label-xs" className={styles.rowSub}>
                {row.sub}
              </Text>
            </div>
            <div className={styles.barWrap}>
              <div
                className={row.off ? `${styles.bar} ${styles.barOff}` : styles.bar}
                style={{ width: `${Math.min(100, (row.px / railMax) * 100)}%` }}
              />
              {row.off && (
                <Badge variant="warning" mono>
                  {row.snapTo}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <ExportPanel render={(format) => exportTokens(GROUP, exportEntries, format)} />
    </main>
  );
}
