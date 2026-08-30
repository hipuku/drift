/**
 * The colour tab's specimens and its detail rail.
 *
 * A colour is the one token you judge by looking rather than by reading, so
 * these carry more than a value and a count: the swatch itself, what the colour
 * is near, and where it is used. `ColourDetail` and `ColourCard` are two views
 * of one swatch — the card is the grid, the detail is the rail beside it — which
 * is why they live together rather than one per file.
 */

import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";
import { Text } from "../../../components/Text/Text.js";
import type { AuditColourSwatch } from "../../../lib/api.js";
import {
  NEAREST_DELTA_E,
  alphaOf,
  nearKind,
  pathOf,
  usageText,
  type NearKind,
} from "../auditModel.js";
import styles from "./colour.module.css";
import shared from "../shared.module.css";

export function ColourCard({
  sw,
  id,
  selected,
  flash,
  onSelect,
}: {
  sw: AuditColourSwatch;
  id: string;
  selected: boolean;
  flash: boolean;
  onSelect: () => void;
}) {
  // Thinned card: just the value, headline usage, and a flag when it perceptually
  // duplicates another hue. Role split, pages, and elements live in the rail.
  const isDup = sw.nearest != null && nearKind(sw.hex, sw.nearest) === "duplicate";
  return (
    <button
      type="button"
      id={id}
      className={`${shared.card} ${shared.cardBtn}${selected ? ` ${styles.cardOn}` : ""}${
        flash ? ` ${styles.cardFlash}` : ""
      }`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.swatchFill} style={{ background: sw.hex }} />
      <span className={styles.cardMeta}>
        <Text role="mono" className={styles.cardValue}>
          {sw.hex.toUpperCase()}
        </Text>
        <span className={shared.pills}>
          <span className={shared.pill}>{sw.count.toLocaleString()}× used</span>
          {isDup && <span className={`${shared.pill} ${shared.pillDup}`}>≈ ΔE {sw.nearest!.deltaE}</span>}
        </span>
      </span>
    </button>
  );
}

const ROLE_ORDER = [
  { key: "background" as const, short: "bg", label: "Background" },
  { key: "text" as const, short: "text", label: "Text" },
  { key: "border" as const, short: "border", label: "Border" },
];

/** The drawer header: the swatch, its hex, and headline usage. */
export function ColourDrawerTitle({ sw, totalPages }: { sw: AuditColourSwatch; totalPages: number }) {
  return (
    <div className={styles.drawerTitle}>
      <span className={styles.drawerSwatch} style={{ background: sw.hex }} />
      <div>
        <Text role="heading-sm" as="span" className={styles.drawerHex}>
          {sw.hex.toUpperCase()}
        </Text>
        <Text role="label-xs" className={shared.muted}>
          {usageText(sw.count, totalPages, sw.pages.length)}
        </Text>
      </div>
    </div>
  );
}

/** One related-colour row: swatch, relationship label, and ΔE or opacity. */
export function NearCallout({
  hex,
  kind,
  deltaE,
  onPick,
}: {
  hex: string;
  kind: NearKind;
  deltaE: number;
  onPick: (hex: string) => void;
}) {
  const label =
    kind === "opacity"
      ? "Same colour, different opacity"
      : kind === "duplicate"
        ? "Indistinguishable from"
        : "Nearest colour";
  return (
    <button
      type="button"
      className={kind === "duplicate" ? `${styles.nearCallout} ${styles.nearDup}` : styles.nearCallout}
      onClick={() => onPick(hex)}
    >
      <span className={styles.nearSwatchWrap}>
        <span className={styles.nearSwatch} style={{ background: hex }} />
      </span>
      <span className={styles.nearText}>
        <Text role="body-sm">{label}</Text>
        <Text role="mono" className={styles.nearHex}>
          {hex.toUpperCase()}
        </Text>
      </span>
      <Text role="mono" className={styles.nearDelta}>
        {kind === "opacity" ? `${Math.round(alphaOf(hex) * 100)}%` : `ΔE ${deltaE}`}
      </Text>
    </button>
  );
}

/** Drawer content for a colour: related colours, roles, elements, pages. */
export function ColourDetail({
  sw,
  totalPages,
  onPick,
}: {
  sw: AuditColourSwatch;
  totalPages: number;
  onPick: (hex: string) => void;
}) {
  const roles = ROLE_ORDER.map((r) => ({ label: r.label, n: sw.roles[r.key] })).filter((r) => r.n > 0);
  const total = roles.reduce((n, r) => n + r.n, 0) || 1;
  const elements = sw.elements;

  // Elements are ranked by frequency by default; the toggle groups them by tag
  // (all `a`, all `div`…), tags in alphabetical order for quick scanning.
  const [grouped, setGrouped] = useState(false);
  const elementGroups = useMemo(() => {
    const map = new Map<string, { tag: string; total: number; rows: typeof elements }>();
    for (const e of elements) {
      const g = map.get(e.tag) ?? { tag: e.tag, total: 0, rows: [] };
      g.total += e.count;
      g.rows.push(e);
      map.set(e.tag, g);
    }
    return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  }, [elements]);

  // Show every relationship — all opacity variants and near-duplicates — not just
  // the single closest. Fall back to the one nearest colour only when it's close
  // enough to matter; a colour whose nearest is far (white ↔ black, ΔE 100) stands
  // alone and gets no call-out.
  const near = sw.nearest;
  const relations: { hex: string; kind: NearKind; deltaE: number }[] =
    sw.related && sw.related.length > 0
      ? sw.related.map((r) => ({
          hex: r.hex,
          kind: r.opacityVariant ? "opacity" : "duplicate",
          deltaE: r.deltaE,
        }))
      : near && near.deltaE < NEAREST_DELTA_E
        ? [{ hex: near.hex, kind: nearKind(sw.hex, near), deltaE: near.deltaE }]
        : [];

  return (
    <div className={styles.drawerContent}>
      {relations.length > 0 && (
        <div className={styles.relatedList}>
          {relations.map((r) => (
            <NearCallout key={r.hex} hex={r.hex} kind={r.kind} deltaE={r.deltaE} onPick={onPick} />
          ))}
        </div>
      )}

      <div className={styles.detailSection}>
        <Text role="label-xs" className={styles.detailLabel}>
          Roles
        </Text>
        <div className={styles.roleBars}>
          {roles.map((r) => (
            <div key={r.label} className={styles.roleRow}>
              <span className={styles.roleName}>{r.label}</span>
              <span className={styles.roleTrack}>
                <span className={styles.roleFill} style={{ width: `${(r.n / total) * 100}%` }} />
              </span>
              <span className={styles.rolePct}>{Math.round((r.n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {elements.length > 0 && (
        <div className={styles.detailSection}>
          <div className={styles.detailHead}>
            <Text role="label-xs" className={styles.detailLabel}>
              Used by {elements.length} element {elements.length === 1 ? "type" : "types"}
            </Text>
            {elementGroups.length < elements.length && (
              <button
                type="button"
                className={grouped ? `${styles.sortToggle} ${styles.sortToggleOn}` : styles.sortToggle}
                aria-pressed={grouped}
                title={grouped ? "Sort by frequency" : "Group by element"}
                onClick={() => setGrouped((g) => !g)}
              >
                <FontAwesomeIcon icon={faLayerGroup} />
              </button>
            )}
          </div>
          <div className={styles.elementList}>
            {grouped
              ? elementGroups.map((g) => (
                  <div key={g.tag} className={styles.elementGroup}>
                    <div className={styles.elementGroupHead}>
                      <Text role="mono" className={styles.elementTag}>
                        {g.tag}
                      </Text>
                      <span className={styles.elementCount}>{g.total.toLocaleString()}×</span>
                    </div>
                    {g.rows.map((e) => (
                      <div key={`${e.tag}|${e.role}`} className={styles.elementSubRow}>
                        <span className={styles.elementRole}>{e.role}</span>
                        <span className={styles.elementCount}>{e.count.toLocaleString()}×</span>
                      </div>
                    ))}
                  </div>
                ))
              : elements.map((e) => (
                  <div key={`${e.tag}|${e.role}`} className={styles.elementRow}>
                    <Text role="mono" className={styles.elementTag}>
                      {e.tag}
                    </Text>
                    <span className={styles.elementRole}>{e.role}</span>
                    <span className={styles.elementCount}>{e.count.toLocaleString()}×</span>
                  </div>
                ))}
          </div>
        </div>
      )}

      <div className={styles.detailSection}>
        <Text role="label-xs" className={styles.detailLabel}>
          On {sw.pages.length} {totalPages > 1 ? `of ${totalPages} ` : ""}
          {sw.pages.length === 1 ? "page" : "pages"}
        </Text>
        <div className={styles.pageChips}>
          {sw.pages.map((p) => (
            <span key={p} className={styles.pageChip}>
              {pathOf(p)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
