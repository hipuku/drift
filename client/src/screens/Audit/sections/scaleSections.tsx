/**
 * The two tabs measured against a reference: type against a modular scale,
 * spacing against a grid.
 *
 * These are the only sections that own state. Both references are selectable so
 * a reader can test a candidate other than the detected one, and that selection
 * belongs here rather than on the screen: it changes this section's ruler and
 * table together and nothing else. The verdict and the export read the
 * automatic fit, which is what keeps exploring a hypothesis from rewriting the
 * diagnosis.
 */

import { useMemo, useState } from "react";
import { Text } from "../../../components/Text/Text.js";
import type { SiteAudit } from "../../../lib/api.js";
import { RATIOS } from "../../../lib/typeScale.js";
import { detectGridBase, offGrid, usageText, type DisplayUnit } from "../auditModel.js";
import { SpacingRuler, TypeRuler } from "../parts/rulers.js";
import { LengthValue, Table, TagsCell } from "../parts/tables.js";
import styles from "./scale.module.css";
import shared from "../shared.module.css";

export function TypeSection({
  typography,
  pages,
  fontStack,
  unit,
  bestRatio,
  offScaleFor,
}: {
  typography: SiteAudit["typography"];
  pages: number;
  fontStack: string;
  unit: DisplayUnit;
  bestRatio: { id: string; name: string; ratio: number } | null;
  offScaleFor: (ratio: number) => Set<number>;
}) {
  const [ratioId, setRatioId] = useState<string | null>(null);
  const activeRatio = RATIOS.find((r) => r.id === ratioId) ?? bestRatio;
  const offScalePx = useMemo(
    () => (activeRatio ? offScaleFor(activeRatio.ratio) : new Set<number>()),
    [activeRatio, offScaleFor],
  );
  const rows = useMemo(() => [...typography.sizes].sort((a, b) => b.px - a.px), [typography.sizes]);

  return (
    <>
      <Text role="label-sm" as="h3" className={styles.sectionLabel}>
        Families
      </Text>
      <div className={shared.familyList}>
        {typography.families.map((f) => (
          <div key={f.family} className={shared.familyRow}>
            <span className={styles.familyRowGlyph} style={{ fontFamily: `'${f.family}', var(--font-sans)` }}>
              Ag
            </span>
            <span className={styles.familyRowName}>{f.family}</span>
            <span className={shared.pill}>{usageText(f.count, pages)}</span>
          </div>
        ))}
      </div>

      <TypeRuler
        sizes={typography.sizes}
        activeRatio={activeRatio}
        bestRatioId={bestRatio?.id ?? null}
        offCountFor={(ratio) => offScaleFor(ratio).size}
        onSelect={setRatioId}
      />

      <Table head={["Scale", "Size", "Weight", "Tags", "Uses"]}>
        {rows.map((r) => (
          <tr key={r.px}>
            <td className={styles.typeScaleCell}>
              <span
                className={styles.typeSpecimen}
                style={{ fontSize: `${Math.min(r.px, 32)}px`, fontWeight: r.weights[0], fontFamily: fontStack }}
              >
                Ag
              </span>
            </td>
            <td className={shared.valueCell}>
              <LengthValue px={r.px} unit={unit}>
                {offScalePx.has(r.px) && (
                  <span className={shared.offScaleDot} title="Off the closest scale" />
                )}
              </LengthValue>
            </td>
            <td className={shared.valueCell}>
              {r.weights.length ? [...r.weights].sort((a, b) => a - b).join(" · ") : "—"}
            </td>
            <TagsCell tags={r.tags} />
            <td className={shared.usageCell}>{r.count.toLocaleString()}×</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

export function SpacingSection({
  spacing,
  unit,
}: {
  spacing: SiteAudit["spacing"];
  unit: DisplayUnit;
}) {
  const values = useMemo(() => spacing.map((v) => v.value), [spacing]);
  const detectedBase = useMemo(() => detectGridBase(values), [values]);
  const [chosenBase, setChosenBase] = useState<number | null>(null);
  const base = chosenBase ?? detectedBase;
  const offGridSet = useMemo(() => offGrid(values, base), [values, base]);
  const max = spacing.reduce((m, v) => Math.max(m, v.value), 1);

  return (
    <>
      <SpacingRuler
        values={values}
        base={base}
        detectedBase={detectedBase}
        offCountFor={(b) => offGrid(values, b).size}
        onSelect={setChosenBase}
      />
      <Table head={["Preview", "Value", "Attribute", "Tags", "Uses"]}>
        {spacing.map((v) => (
          <tr key={v.value}>
            <td className={shared.spacingPreviewCell}>
              <span className={styles.bar} style={{ width: `${Math.max((v.value / max) * 100, 4)}%` }} />
            </td>
            <td className={shared.valueCell}>
              <LengthValue px={v.value} unit={unit}>
                {offGridSet.has(v.value) && (
                  <span className={shared.offScaleDot} title={`Off the ${base}px grid`} />
                )}
              </LengthValue>
            </td>
            <TagsCell tags={(v.properties ?? []).map((p) => ({ tag: p.property, count: p.count }))} />
            <TagsCell tags={v.tags} />
            <td className={shared.usageCell}>{v.count.toLocaleString()}×</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
