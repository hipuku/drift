/**
 * Z-index proposal (Layer 2, "what it could be") — consolidate onto a named
 * layering ladder.
 *
 * Maps the site's arbitrary stacking values onto a canonical, evenly-spaced
 * ladder (dropdown…toast) by order. Toggle Current↔Proposed via the shared
 * ProposalScaffold: Current shows the site's raw z-index values with the layer
 * each maps to; Proposed shows the clean ladder. Bars encode stacking *order*
 * (rank), not raw magnitude, so a stray 9999 doesn't flatten the rest.
 */

import { useMemo, useState } from "react";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditNumberTagUsage } from "../../lib/api.js";
import { exportTokens, type TokenEntry, type TokenGroup } from "../../lib/exportTokens.js";
import { assignLayers } from "../../lib/zIndexScale.js";
import { ProposalScaffold } from "./ProposalScaffold.js";
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
    <ProposalScaffold
      onBack={onBack}
      title="What your layering could be"
      intro={
        <>
          <strong>{assignments.length}</strong> stacking value{assignments.length === 1 ? "" : "s"} in use · map to a
          named ladder
          {inflated > 0 ? (
            <>
              {" "}
              · <strong>{inflated}</strong> inflated
            </>
          ) : null}
          .
        </>
      }
      applied={applied}
      onAppliedChange={setApplied}
      hint={applied ? "Named ladder applied" : "Showing the site's current z-index values"}
      exportPanel={<ExportPanel render={(format) => exportTokens(GROUP, exportEntries, format)} />}
    >
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
    </ProposalScaffold>
  );
}
