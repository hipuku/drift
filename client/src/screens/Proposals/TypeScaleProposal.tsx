/**
 * Type proposal (Layer 2, "what it could be") — role-first.
 *
 * A website's type system is a semantic hierarchy, not an abstract ladder: H1…H6,
 * body, small, button. We already know which size every tag actually renders at,
 * so the primary view is that hierarchy, named as tokens, rendered as a specimen
 * in the site's own font. The modular ratio is the *optional* second step —
 * "Regularise" snaps each role onto even steps of a chosen ratio, anchored at
 * body, so the jumps between roles become consistent. Deterministic.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { SiteAudit } from "../../lib/api.js";
import { exportTokens, type TokenEntry, type TokenGroup } from "../../lib/exportTokens.js";
import {
  baseFromRoles,
  detectClosestRatioForRoles,
  regularizeRoles,
  roleLabel,
  roleToken,
  sortRoles,
  type TypeRole,
} from "../../lib/roleScale.js";
import { RATIOS } from "../../lib/typeScale.js";
import styles from "./TypeScaleProposal.module.css";

const SAMPLE = "Design systems drift over time";
const GROUP: TokenGroup = { group: "text", type: "dimension", tailwindKey: "fontSize" };

interface Props {
  typography: SiteAudit["typography"];
  /** Optional path back to the report; omitted in the dev harness. */
  onBack?: () => void;
}

export function TypeScaleProposal({ typography, onBack }: Props) {
  const roles: TypeRole[] = useMemo(() => typography.roles ?? [], [typography.roles]);
  const family = typography.families?.[0]?.family ?? null;

  const basePx = useMemo(() => baseFromRoles(roles), [roles]);
  const closest = useMemo(() => detectClosestRatioForRoles(roles, basePx), [roles, basePx]);

  const [ratioId, setRatioId] = useState(closest?.id ?? "major-third");
  const [regularised, setRegularised] = useState(false);

  const ratio = RATIOS.find((r) => r.id === ratioId) ?? RATIOS[1]!;
  const regular = useMemo(
    () => regularizeRoles(roles, basePx, ratio.ratio),
    [roles, basePx, ratio.ratio],
  );
  const changing = regular.filter((r) => r.changed).length;

  const fontStack = family ? `'${family}', var(--font-sans)` : "var(--font-sans)";

  const rows = regularised
    ? regular.map((r) => ({
        key: r.tag,
        tag: r.tag,
        px: r.proposedPx,
        weight: r.weight,
        note: r.changed ? `was ${r.currentPx}px` : "",
        changed: r.changed,
      }))
    : sortRoles(roles).map((r) => ({
        key: r.tag,
        tag: r.tag,
        px: r.px,
        weight: r.weight,
        note: "",
        changed: false,
      }));

  // One token per role; the regularised sizes when applied, else the real ones.
  const exportEntries: TokenEntry[] = rows.map((r) => ({
    name: roleToken(r.tag),
    value: Math.round((r.px / 16) * 1000) / 1000,
    unit: "rem",
  }));

  if (roles.length === 0) {
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
            No semantic text roles were found on the crawled pages.
          </Text>
        </header>
      </main>
    );
  }

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
          <strong>{roles.length}</strong> text role{roles.length === 1 ? "" : "s"} · body{" "}
          <strong>{basePx}px</strong>
          {family ? (
            <>
              {" "}
              · <span className={styles.fam}>{family}</span>
            </>
          ) : null}
          {closest ? (
            <>
              {" "}
              · closest to <strong>{closest.name}</strong>
            </>
          ) : null}
        </Text>
      </header>

      {/* Regularise toggle — the hierarchy is primary, the ratio is optional. */}
      <div className={styles.applyRow}>
        <div className={styles.toggle} role="tablist" aria-label="Preview">
          <button
            type="button"
            role="tab"
            aria-selected={!regularised}
            className={!regularised ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => setRegularised(false)}
          >
            Current
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={regularised}
            className={regularised ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => setRegularised(true)}
          >
            Regularised
          </button>
        </div>
        <Text role="label-sm" className={styles.applyHint}>
          {regularised
            ? `${ratio.name} · ${changing} role${changing === 1 ? "" : "s"} resized`
            : "Showing each role at the size the site renders it"}
        </Text>
      </div>

      {/* Ratio picker — only meaningful once you're regularising. */}
      {regularised && (
        <div className={styles.ratios} role="radiogroup" aria-label="Modular scale">
          {RATIOS.map((r) => {
            const active = r.id === ratioId;
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
                {closest?.id === r.id && <span className={styles.closest}>closest</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Specimen ladder, by role */}
      <div className={styles.ladder}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <div className={styles.rowMeta}>
              <Text role="label" className={styles.roleName}>
                {roleLabel(row.tag)}
              </Text>
              <Text role="mono" className={styles.rowLabel}>
                {row.px}px{row.weight ? ` · ${row.weight}` : ""}
              </Text>
              {row.note && <Badge variant="info">{row.note}</Badge>}
            </div>
            <div
              className={styles.specimen}
              style={{
                fontSize: `${row.px}px`,
                fontFamily: fontStack,
                fontWeight: row.weight ?? undefined,
              }}
            >
              {SAMPLE}
            </div>
          </div>
        ))}
      </div>

      <ExportPanel render={(format) => exportTokens(GROUP, exportEntries, format)} />
    </main>
  );
}
