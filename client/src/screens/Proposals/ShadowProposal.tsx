/**
 * Shadow proposal (Layer 2, "what it could be") — an elevation ladder.
 *
 * Orders the site's ad-hoc shadows by computed elevation and names them as a
 * ladder (sm…). Toggle Current↔Proposed: Current shows every observed shadow in
 * elevation order, flagging ones that fold into a level they aren't the
 * representative of; Proposed shows the clean named ladder with the shadows that
 * consolidate into each level. Previews render on a fixed light canvas so the
 * shadows read regardless of theme. Export as CSS / Tailwind / DTCG.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditShadowUsage } from "../../lib/api.js";
import { exportStringTokens, type StringTokenEntry, type StringTokenGroup } from "../../lib/exportTokens.js";
import { buildElevationLadder, elevationWeight, parseShadow } from "../../lib/shadowScale.js";
import styles from "./ShadowProposal.module.css";

const GROUP: StringTokenGroup = { group: "shadow", dtcgType: "shadow", tailwindKey: "boxShadow" };

interface Props {
  shadow: AuditShadowUsage[];
  onBack?: () => void;
}

export function ShadowProposal({ shadow, onBack }: Props) {
  const usages = useMemo(() => shadow.map((s) => ({ value: s.value, count: s.count })), [shadow]);
  const [applied, setApplied] = useState(false);

  const ladder = useMemo(() => buildElevationLadder(usages), [usages]);

  // Map each observed shadow to its level name + whether it's the representative.
  const levelOf = useMemo(() => {
    const map = new Map<string, { name: string; rep: boolean }>();
    for (const level of ladder) {
      for (const m of level.members) {
        map.set(m.value, { name: level.name, rep: m.value === level.representative });
      }
    }
    return map;
  }, [ladder]);

  const foldable = usages.filter((u) => !levelOf.get(u.value)?.rep).length;

  const exportEntries: StringTokenEntry[] = ladder.map((l) => ({ name: l.name, value: l.representative }));

  const rows = applied
    ? ladder.map((l) => ({
        key: `p${l.name}`,
        shadow: l.representative,
        label: l.name,
        sub: l.representative,
        off: false,
        note: l.members.length > 1 ? `${l.members.length} shadows consolidate here` : "",
      }))
    : usages
        .slice()
        .sort((a, b) => elevationWeight(parseShadow(a.value)) - elevationWeight(parseShadow(b.value)))
        .map((u) => {
          const lvl = levelOf.get(u.value);
          return {
            key: `c${u.value}`,
            shadow: u.value,
            label: lvl?.name ?? "—",
            sub: u.value,
            off: !lvl?.rep,
            note: lvl && !lvl.rep ? `→ ${lvl.name}` : "",
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
          What your shadows could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          <strong>{usages.length}</strong> distinct shadow{usages.length === 1 ? "" : "s"} form a{" "}
          <strong>{ladder.length}</strong>-level elevation ladder
          {foldable > 0 ? (
            <>
              {" "}
              · <strong>{foldable}</strong> consolidate
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
          {applied ? "Elevation ladder applied" : "Showing the site's current shadows"}
        </Text>
      </div>

      {/* Elevation ladder — previews on a fixed light canvas */}
      <div className={styles.ladder}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <div className={styles.rowMeta}>
              <Text role="mono" className={styles.rowLabel}>
                {row.label}
              </Text>
              {row.note && (
                <Badge variant={row.off ? "warning" : "info"} mono={row.off}>
                  {row.note}
                </Badge>
              )}
            </div>
            <div className={styles.canvas}>
              <div className={styles.tile} style={{ boxShadow: row.shadow }} aria-hidden="true" />
            </div>
            <span className={styles.value} title={row.sub}>
              {row.sub}
            </span>
          </div>
        ))}
      </div>

      <ExportPanel render={(format) => exportStringTokens(GROUP, exportEntries, format)} />
    </main>
  );
}
