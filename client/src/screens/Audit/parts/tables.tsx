/**
 * Shared presentation for the audit screen's sections.
 *
 * Every token tab renders the same three things — an inventory table, a value
 * with its unit, a cell of element-tag chips — so they live here rather than in
 * whichever section happened to need them first. Sections own what is specific
 * to their token; this file owns what they have in common.
 *
 * These read `Audit.module.css` deliberately: the table, chip and cell classes
 * are shared by every section, so splitting them per-section would duplicate
 * the rules rather than separate them.
 */

import type { ReactNode } from "react";
import { MAX_TAG_CHIPS, toRem, type DisplayUnit } from "../auditModel.js";
import styles from "./tables.module.css";
import shared from "../shared.module.css";

/**
 * A length value in the selected unit, with the other unit as a muted note (C2).
 * Both are always shown — px is what shipped, rem is the accessibility-relevant
 * form. `children` is the off-scale/off-grid dot, kept inside the primary span so
 * its positioning is unchanged.
 */
export function LengthValue({ px, unit, children }: { px: number; unit: DisplayUnit; children?: ReactNode }) {
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

/**
 * Every inventory table. Wrapped in an overflow-x container so a wide row —
 * a long shadow string, a site with many element tags — scrolls inside the
 * panel instead of stretching the page.
 */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={className ? `${shared.table} ${className}` : shared.table}>
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
export function ZIndexLadder({ rank, total }: { rank: number; total: number }) {
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
/** A table cell of element-tag chips — the shared attribution column. */

/**
 * Element tags for a row. Accepts counted tags (most tables) or bare tag names
 * (contrast pairs). Caps the visible chips so a site that uses one value on
 * thirty element types doesn't turn one row into a paragraph — the rest are
 * summarised in a titled "+N" chip.
 */
export function TagsCell({ tags }: { tags?: ({ tag: string; count: number } | string)[] }) {
  const all = (tags ?? []).map((t) => (typeof t === "string" ? { tag: t, count: null } : t));
  const shown = all.slice(0, MAX_TAG_CHIPS);
  const rest = all.slice(MAX_TAG_CHIPS);
  return (
    <td className={styles.tagsCell}>
      <span className={styles.tagChips}>
        {shown.map((tg) => (
          <span
            key={tg.tag}
            className={shared.tagChip}
            title={tg.count != null ? `${tg.count.toLocaleString()}×` : undefined}
          >
            {tg.tag}
          </span>
        ))}
        {rest.length > 0 && (
          <span className={shared.tagChip} title={rest.map((t) => t.tag).join(", ")}>
            +{rest.length}
          </span>
        )}
      </span>
    </td>
  );
}
