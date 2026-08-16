/**
 * Shadow proposal (Layer 2, "what it could be") — consolidate into an elevation
 * ladder.
 *
 * Orders the site's ad-hoc shadows by computed elevation and names them as a
 * ladder (sm…). Toggle Current↔Proposed via the shared ProposalScaffold:
 * Current shows every observed shadow in elevation order, flagging ones that
 * fold into a level they aren't the representative of; Proposed shows the clean
 * named ladder with the shadows that consolidate into each level. Previews
 * render on a fixed light canvas so the shadows read regardless of theme.
 */

import { useMemo, useState } from "react";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditShadowUsage } from "../../lib/api.js";
import { exportStringTokens, type StringTokenEntry, type StringTokenGroup } from "../../lib/exportTokens.js";
import { buildElevationLadder, elevationWeight, parseShadow } from "../../lib/shadowScale.js";
import { ProposalScaffold } from "./ProposalScaffold.js";
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
    <ProposalScaffold
      onBack={onBack}
      title="What your shadows could be"
      intro={
        <>
          <strong>{usages.length}</strong> shadow{usages.length === 1 ? "" : "s"} in use · order into a{" "}
          <strong>{ladder.length}</strong>-level elevation ladder
          {foldable > 0 ? (
            <>
              {" "}
              · <strong>{foldable}</strong> to consolidate
            </>
          ) : null}
          .
        </>
      }
      applied={applied}
      onAppliedChange={setApplied}
      hint={applied ? "Elevation ladder applied" : "Showing the site's current shadows"}
      exportPanel={<ExportPanel render={(format) => exportStringTokens(GROUP, exportEntries, format)} />}
    >
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
    </ProposalScaffold>
  );
}
