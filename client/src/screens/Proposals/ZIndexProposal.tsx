/**
 * Z-index proposal (Layer 2, "what it could be") — a named layering ladder.
 *
 * Maps the site's arbitrary stacking values onto a canonical, evenly-spaced
 * ladder (dropdown…toast) by order. Toggle Current↔Proposed: Current shows the
 * site's raw z-index values with the layer each maps to; Proposed shows the
 * clean ladder. Bars encode stacking *order* (rank), not raw magnitude, so a
 * stray 9999 doesn't flatten the rest. Export as CSS / Tailwind / DTCG.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditNumberTagUsage } from "../../lib/api.js";
import { exportTokens, type TokenEntry, type TokenGroup } from "../../lib/exportTokens.js";
import { assignLayers } from "../../lib/zIndexScale.js";
import styles from "./ZIndexProposal.module.css";

const GROUP: TokenGroup = { group: "z", type: "number", tailwindKey: "zIndex" };

interface Props {
  zIndex: AuditNumberTagUsage[];
  onBack?: () => void;
}

export function ZIndexProposal({ zIndex, onBack }: Props) {
  const values = useMemo(() => zIndex.map((z) => z.value), [zIndex]);
  const countOf = useMemo(() => new Map(zIndex.map((z) => [z.value, z.count])), [zIndex]);
  const [applied, setApplied] = useState(false);

  const assignments = useMemo(() => assignLayers(values), [values]);
  const total = assignments.length || 1;

  // A stray value is "inflated" when its raw number dwarfs its ordinal position.
  const inflated = assignments.filter((a) => a.current > a.layer.value * 4).length;

  const exportEntries: TokenEntry[] = assignments.map((a) => ({ name: a.layer.name, value: a.layer.value }));

  const rows = assignments.map((a) => ({
    key: a.current,
    rank: a.rank,
    label: applied ? a.layer.name : `${a.current}`,
    sub: applied ? `${a.layer.value}` : `used ${countOf.get(a.current) ?? 0}×`,
    note: applied ? "" : `→ ${a.layer.name} (${a.layer.value})`,
    inflated: !applied && a.current > a.layer.value * 4,
  }));

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to proposals
          </button>
        )}
        <Text role="heading-lg" as="h1">
          What your layering could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          <strong>{assignments.length}</strong> stacking value{assignments.length === 1 ? "" : "s"} map to a named
          ladder
          {inflated > 0 ? (
            <>
              {" "}
              · <strong>{inflated}</strong> inflated
            </>
          ) : null}
          .
        </Text>
      </header>

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
          {applied ? "Named ladder applied" : "Showing the site's current z-index values"}
        </Text>
      </div>

      {/* Layer ladder — highest layer on top */}
      <div className={styles.ladder}>
        {rows
          .slice()
          .reverse()
          .map((row) => (
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
                  className={row.inflated ? `${styles.bar} ${styles.barOff}` : styles.bar}
                  style={{ width: `${((row.rank + 1) / total) * 100}%` }}
                />
                {row.note && (
                  <Badge variant={row.inflated ? "warning" : "info"} mono>
                    {row.note}
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
