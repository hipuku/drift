/**
 * Radius proposal (Layer 2, "what it could be") — fit to a canonical ramp.
 *
 * Fits the site's observed corner radii onto a fixed named ramp (none…2xl, plus
 * a `full` pill when warranted) and previews each as a rounded tile. Toggle
 * Current↔Proposed: Current shows the site's radii with off-ramp ones flagged
 * and the token they'd fold into; Proposed shows the clean ramp, noting where
 * several current values consolidate into one. Export as CSS / Tailwind / DTCG.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditRadiusUsage } from "../../lib/api.js";
import { exportTokens, type TokenEntry, type TokenGroup } from "../../lib/exportTokens.js";
import { buildRadiusRamp, classifyAgainstRamp } from "../../lib/radiusScale.js";
import styles from "./RadiusProposal.module.css";

const GROUP: TokenGroup = { group: "radius", type: "dimension", tailwindKey: "borderRadius" };
/** Visual cap so a pill tile doesn't render as a circle that dwarfs the row. */
const PREVIEW_MAX_PX = 20;

interface Props {
  radius: AuditRadiusUsage[];
  onBack?: () => void;
}

export function RadiusProposal({ radius, onBack }: Props) {
  const values = useMemo(() => radius.map((r) => r.value), [radius]);
  const [applied, setApplied] = useState(false);

  const ramp = useMemo(() => buildRadiusRamp(values), [values]);
  const classification = useMemo(
    () => classifyAgainstRamp(values, ramp).map((c, i) => ({ ...c, count: radius[i]?.count ?? 0 })),
    [values, ramp, radius],
  );

  const offRamp = classification.filter((c) => !c.onRamp).length;

  // How many current values fold into each ramp step — surfaces consolidation.
  const foldCount = new Map<string, number>();
  for (const c of classification) {
    foldCount.set(c.nearest.name, (foldCount.get(c.nearest.name) ?? 0) + 1);
  }

  const previewRadius = (px: number): string => `${Math.min(px, PREVIEW_MAX_PX)}px`;

  const exportEntries: TokenEntry[] = ramp.map((s) => ({ name: s.name, value: s.px, unit: "px" }));

  const rows = applied
    ? ramp.map((s) => {
        const folds = foldCount.get(s.name) ?? 0;
        return {
          key: `p${s.name}`,
          px: s.px,
          label: s.name,
          sub: s.name === "full" ? "pill" : `${s.px}px`,
          off: false,
          note: folds > 1 ? `${folds} values consolidate here` : "",
        };
      })
    : classification
        .slice()
        .sort((a, b) => a.px - b.px)
        .map((c) => ({
          key: `c${c.px}`,
          px: c.px,
          label: `${c.px}px`,
          sub: `used ${c.count}×`,
          off: !c.onRamp,
          note: c.onRamp ? "" : `→ ${c.nearest.name} (${c.nearest.px}px)`,
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
          What your radii could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          <strong>{values.length}</strong> distinct radi{values.length === 1 ? "us" : "i"} fit a{" "}
          <strong>{ramp.length}</strong>-step ramp
          {offRamp > 0 ? (
            <>
              {" "}
              · <strong>{offRamp}</strong> sit off it
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
          {applied ? "Canonical ramp applied" : "Showing the site's current radii"}
        </Text>
      </div>

      {/* Radius tiles */}
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
            <div
              className={row.off ? `${styles.tile} ${styles.tileOff}` : styles.tile}
              style={{ borderTopLeftRadius: previewRadius(row.px), borderTopRightRadius: previewRadius(row.px) }}
              aria-hidden="true"
            />
            {row.note && (
              <Badge variant={row.off ? "warning" : "info"} mono={row.off}>
                {row.note}
              </Badge>
            )}
          </div>
        ))}
      </div>

      <ExportPanel render={(format) => exportTokens(GROUP, exportEntries, format)} />
    </main>
  );
}
