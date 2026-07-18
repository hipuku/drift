/**
 * The Audit — Stage 1, "what it is".
 *
 * Two presentation modes, chosen by what the token *is*:
 *  - Cards for tokens you judge visually — colour swatches, type families,
 *    shadows, gradients. A specimen with its value and usage.
 *  - Tables for scalar tokens — the type scale, spacing, radius, borders, etc.
 *    A small specimen, the value, and usage, in aligned rows with dividers.
 *
 * Overview is the diagnosis: a synthesised health line plus verdict cards
 * tinted green / orange / red (good / watch / needs-review) with the detail as
 * pills. The colour — and a bottom accent rule — is the verdict.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../../components/Button/Button.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditColourSwatch, SiteAudit } from "../../lib/api.js";
import styles from "./Audit.module.css";

type Verdict = "good" | "watch" | "review";

interface Props {
  audit: SiteAudit;
  onProposals?: () => void;
  onBack?: () => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

function healthLine(s: SiteAudit["summary"]): string {
  const parts = [
    `${s.distinctColours} ${plural(s.distinctColours, "colour")} in ${s.colourFamilies} ${plural(
      s.colourFamilies,
      "family",
      "families",
    )}${
      s.colourNearDuplicates > 0
        ? ` with ${s.colourNearDuplicates} near-${plural(s.colourNearDuplicates, "duplicate")}`
        : ""
    }`,
    `${s.typeSizes} type ${plural(s.typeSizes, "size")} across ${s.fontFamilies} ${plural(
      s.fontFamilies,
      "family",
      "families",
    )}`,
    `${s.spacings} ad-hoc spacing ${plural(s.spacings, "value")}`,
  ];
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`;
}

function usageChips(count: number, totalPages: number, tokenPages?: number): string[] {
  const chips = [`${count.toLocaleString()}× used`];
  if (tokenPages != null && totalPages > 1) chips.push(`${tokenPages} ${plural(tokenPages, "page")}`);
  return chips;
}

function usageText(count: number, totalPages: number, tokenPages?: number): string {
  return usageChips(count, totalPages, tokenPages).join(" · ");
}

export function Audit({ audit, onProposals, onBack }: Props) {
  const s = audit.summary;
  const t = audit.typography;
  const family = t.families[0]?.family ?? null;
  const fontStack = family ? `'${family}', var(--font-sans)` : "var(--font-sans)";

  const tabs = useMemo(() => {
    const list = [
      { id: "overview", label: "Overview", count: null as number | null },
      { id: "colour", label: "Colour", count: s.distinctColours },
      { id: "type", label: "Type", count: s.typeSizes },
      { id: "spacing", label: "Spacing", count: s.spacings },
    ];
    if (audit.radius.length) list.push({ id: "radius", label: "Radius", count: s.radii });
    if (audit.shadow.length) list.push({ id: "shadow", label: "Shadow", count: s.shadows });
    if (audit.borders?.length) list.push({ id: "border", label: "Border", count: audit.borders.length });
    if (audit.opacity?.length) list.push({ id: "opacity", label: "Opacity", count: audit.opacity.length });
    if (audit.zIndex?.length) list.push({ id: "zindex", label: "Z-index", count: audit.zIndex.length });
    if (audit.blur?.length) list.push({ id: "blur", label: "Blur", count: audit.blur.length });
    if (audit.breakpoints?.length) list.push({ id: "breakpoint", label: "Breakpoints", count: audit.breakpoints.length });
    if (audit.gradients?.length) list.push({ id: "gradient", label: "Gradient", count: audit.gradients.length });
    if (audit.motion && (audit.motion.durations.length || audit.motion.easings.length))
      list.push({ id: "motion", label: "Motion", count: audit.motion.durations.length + audit.motion.easings.length });
    return list;
  }, [s, audit]);

  const [tab, setTab] = useState("overview");
  const maxSpace = audit.spacing.reduce((m, v) => Math.max(m, v.value), 1);
  const maxBp = audit.breakpoints?.reduce((m, v) => Math.max(m, v.value), 1) ?? 1;

  const verdicts: { label: string; n: number; chips: string[]; verdict: Verdict }[] = [
    {
      label: "Colours",
      n: s.distinctColours,
      verdict: s.colourNearDuplicates > 0 ? "review" : "good",
      chips: [
        `${s.colourFamilies} ${plural(s.colourFamilies, "family", "families")}`,
        s.colourNearDuplicates > 0
          ? `${s.colourNearDuplicates} near-${plural(s.colourNearDuplicates, "duplicate")}`
          : "no near-duplicates",
      ],
    },
    {
      label: "Type",
      n: s.typeSizes,
      verdict: s.typeSizes > 8 ? "review" : s.typeSizes > 5 ? "watch" : "good",
      chips: [
        `${s.fontFamilies} ${plural(s.fontFamilies, "family", "families")}`,
        `${s.fontWeights} ${plural(s.fontWeights, "weight")}`,
      ],
    },
    { label: "Spacing", n: s.spacings, verdict: s.spacings > 10 ? "review" : "watch", chips: ["ad-hoc", "no grid"] },
    {
      label: "Radius",
      n: s.radii,
      verdict: s.radii > 4 ? "watch" : "good",
      chips: [s.radii === 0 ? "none in use" : `${s.radii} ${plural(s.radii, "value")}`],
    },
    {
      label: "Shadows",
      n: s.shadows,
      verdict: s.shadows > 6 ? "watch" : "good",
      chips: [s.shadows === 0 ? "none in use" : `${s.shadows} ${plural(s.shadows, "value")}`],
    },
  ];
  if (audit.motion && (audit.motion.durations.length || audit.motion.easings.length)) {
    verdicts.push({
      label: "Motion",
      n: audit.motion.durations.length + audit.motion.easings.length,
      verdict: "watch",
      chips: [
        `${audit.motion.durations.length} ${plural(audit.motion.durations.length, "duration")}`,
        `${audit.motion.easings.length} ${plural(audit.motion.easings.length, "easing")}`,
      ],
    });
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `drift-audit-${hostOf(audit.rootUrl)}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  // Type scale rows — sizes with their weight folded in (largest first). Prefer
  // the semantic roles (they carry weight); fall back to the bare size list.
  const scaleRows = (
    t.roles.length > 0
      ? t.roles.map((r) => ({ key: r.tag, px: r.px, weight: r.weight != null ? String(r.weight) : "—", count: r.count }))
      : t.sizes.map((sz) => ({ key: String(sz.px), px: sz.px, weight: "—", count: sz.count }))
  ).sort((a, b) => b.px - a.px);

  return (
    <div className={styles.page}>
      <header>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            <span aria-hidden="true">←</span> New audit
          </button>
        )}
        <div className={styles.titleRow}>
          <div>
            <Text role="display" as="h1" className={styles.title}>
              {hostOf(audit.rootUrl)}
            </Text>
            <Text role="body-lg" as="p" className={styles.intro}>
              Everything in use across {s.pages} {plural(s.pages, "page")}, exactly as shipped.
            </Text>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={exportJson}>
              Export
            </button>
            {onProposals && (
              <Button variant="primary" onClick={onProposals}>
                Fix it →
              </Button>
            )}
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Audit sections">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={tab === tb.id}
              className={tab === tb.id ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
              {tb.count != null && <span className={styles.tabCount}>{tb.count}</span>}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.panel} key={tab}>
        {tab === "overview" && (
          <>
            <div className={styles.health}>
              <Text role="label-sm" className={styles.healthKicker}>
                Design Health
              </Text>
              <Text role="heading-lg" as="p" className={styles.healthLine}>
                {healthLine(s)}
              </Text>
            </div>
            <div className={styles.verdictGrid}>
              {verdicts.map((v) => (
                <div key={v.label} className={`${styles.verdict} ${styles[v.verdict]}`}>
                  <Text role="label" className={styles.verdictLabel}>
                    {v.label}
                  </Text>
                  <Text role="display" as="span" className={styles.verdictN}>
                    {v.n}
                  </Text>
                  <div className={styles.pills}>
                    {v.chips.map((c) => (
                      <span key={c} className={styles.pill}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "colour" &&
          audit.colourFamilies.map((fam) => (
            <div key={fam.name} className={styles.family}>
              <div className={styles.familyHead}>
                <Text role="heading-sm" as="h3">
                  {fam.name}
                </Text>
                <Text role="label-sm" className={styles.muted}>
                  {fam.swatches.length}
                </Text>
              </div>
              <div className={styles.grid}>
                {fam.swatches.map((sw) => (
                  <ColourCard key={sw.hex} sw={sw} totalPages={s.pages} />
                ))}
              </div>
            </div>
          ))}

        {tab === "type" && (
          <>
            <Text role="label-sm" as="h3" className={styles.sectionLabel}>
              Families
            </Text>
            <div className={styles.familyList}>
              {t.families.map((f) => (
                <div key={f.family} className={styles.familyRow}>
                  <span className={styles.familyRowGlyph} style={{ fontFamily: `'${f.family}', var(--font-sans)` }}>
                    Ag
                  </span>
                  <span className={styles.familyRowName}>{f.family}</span>
                  <span className={styles.pill}>{usageText(f.count, s.pages)}</span>
                </div>
              ))}
            </div>

            <Table head={["Scale", "Size", "Weight", "Uses"]}>
              {scaleRows.map((r) => (
                <tr key={r.key}>
                  <td className={styles.specimenCell}>
                    <span
                      className={styles.typeSpecimen}
                      style={{ fontSize: `${Math.min(r.px, 32)}px`, fontWeight: r.weight === "—" ? undefined : Number(r.weight), fontFamily: fontStack }}
                    >
                      Ag
                    </span>
                  </td>
                  <td className={styles.valueCell}>{r.px}px</td>
                  <td className={styles.valueCell}>{r.weight}</td>
                  <td className={styles.usageCell}>{r.count.toLocaleString()}×</td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {tab === "spacing" && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.spacing.map((v) => (
              <tr key={v.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.bar} style={{ width: `${Math.max((v.value / maxSpace) * 100, 4)}%` }} />
                </td>
                <td className={styles.valueCell}>{v.value}px</td>
                <td className={styles.usageCell}>{v.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "radius" && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.radius.map((v) => (
              <tr key={v.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.radiusChip} style={{ borderRadius: `${v.value}px` }} />
                </td>
                <td className={styles.valueCell}>{v.value}px</td>
                <td className={styles.usageCell}>{v.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "shadow" && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.shadow.map((sh, i) => (
              <tr key={i}>
                <td className={styles.specimenCell}>
                  <span className={styles.shadowChip} style={{ boxShadow: sh.value }} />
                </td>
                <td className={`${styles.valueCell} ${styles.valueCellTrunc}`}>{sh.value}</td>
                <td className={styles.usageCell}>{sh.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "gradient" && audit.gradients && (
          <div className={styles.grid}>
            {audit.gradients.map((g, i) => (
              <div key={i} className={styles.card}>
                <div className={styles.gradientBox} style={{ backgroundImage: g.value }} />
                <div className={styles.cardMeta}>
                  <Text role="mono" className={`${styles.cardValue} ${styles.cardValueTrunc}`}>
                    {g.value}
                  </Text>
                  <div className={styles.pills}>
                    <span className={styles.pill}>{usageText(g.count, s.pages)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "border" && audit.borders && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.borders.map((b) => (
              <tr key={b.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.borderChip} style={{ borderWidth: `${b.value}px` }} />
                </td>
                <td className={styles.valueCell}>{b.value}px</td>
                <td className={styles.usageCell}>{b.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "opacity" && audit.opacity && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.opacity.map((o) => (
              <tr key={o.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.checker}>
                    <span className={styles.opacityFill} style={{ opacity: o.value }} />
                  </span>
                </td>
                <td className={styles.valueCell}>{o.value.toFixed(2)}</td>
                <td className={styles.usageCell}>{o.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "zindex" && audit.zIndex && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.zIndex.map((z) => (
              <tr key={z.value}>
                <td className={styles.specimenCell} />
                <td className={styles.valueCell}>{z.value}</td>
                <td className={styles.usageCell}>{z.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "blur" && audit.blur && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.blur.map((b) => (
              <tr key={b.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.blurStage}>
                    <span className={styles.blurGlass} style={{ backdropFilter: `blur(${b.value}px)`, WebkitBackdropFilter: `blur(${b.value}px)` }} />
                  </span>
                </td>
                <td className={styles.valueCell}>{b.value}px</td>
                <td className={styles.usageCell}>{b.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "breakpoint" && audit.breakpoints && (
          <Table head={["Preview", "Value", "Uses"]}>
            {audit.breakpoints.map((bp) => (
              <tr key={bp.value}>
                <td className={styles.specimenCell}>
                  <span className={styles.bpBar} style={{ width: `${Math.max((bp.value / maxBp) * 100, 4)}%` }} />
                </td>
                <td className={styles.valueCell}>{bp.value}px</td>
                <td className={styles.usageCell}>{bp.count.toLocaleString()}×</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "motion" && audit.motion && (
          <>
            <Text role="label-sm" as="h3" className={styles.sectionLabel}>
              Durations
            </Text>
            <Table head={["Preview", "Value", "Uses"]}>
              {audit.motion.durations.map((d) => (
                <tr key={d.value}>
                  <td className={styles.specimenCell}>
                    <span className={styles.motionTrack} style={{ ["--dur" as string]: `${d.value}ms` }}>
                      <span className={styles.motionDot} />
                    </span>
                  </td>
                  <td className={styles.valueCell}>{d.value}ms</td>
                  <td className={styles.usageCell}>{d.count.toLocaleString()}×</td>
                </tr>
              ))}
            </Table>

            <Text role="label-sm" as="h3" className={styles.sectionLabel}>
              Easings
            </Text>
            <Table head={["Preview", "Value", "Uses"]}>
              {audit.motion.easings.map((e) => (
                <tr key={e.value}>
                  <td className={styles.specimenCell}>
                    <span className={styles.motionTrack} style={{ ["--ease" as string]: e.value }}>
                      <span className={styles.easingDot} />
                    </span>
                  </td>
                  <td className={`${styles.valueCell} ${styles.valueCellTrunc}`}>{e.value}</td>
                  <td className={styles.usageCell}>{e.count.toLocaleString()}×</td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

/** A table with a header row and divider lines, used by every scalar token tab. */
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className={styles.table}>
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
  );
}

function ColourCard({ sw, totalPages }: { sw: AuditColourSwatch; totalPages: number }) {
  const roles: [string, number][] = [
    ["bg", sw.roles.background],
    ["text", sw.roles.text],
    ["border", sw.roles.border],
  ];
  const dominant = roles.reduce((a, b) => (b[1] > a[1] ? b : a));
  const chips = usageChips(sw.count, totalPages, sw.pages.length);
  if (dominant[1] > 0) chips.push(`mostly ${dominant[0]}`);
  return (
    <div className={styles.card}>
      <div className={styles.swatchFill} style={{ background: sw.hex }} />
      <div className={styles.cardMeta}>
        <Text role="mono" className={styles.cardValue}>
          {sw.hex.toUpperCase()}
        </Text>
        <div className={styles.pills}>
          {chips.map((c) => (
            <span key={c} className={styles.pill}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
