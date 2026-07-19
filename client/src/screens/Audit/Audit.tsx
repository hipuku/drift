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
import { Drawer } from "../../components/Drawer/Drawer.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditColourSwatch, SiteAudit } from "../../lib/api.js";
import { buildScaleToCover, classifyAgainstScale, detectClosestRatio } from "../../lib/typeScale.js";
import styles from "./Audit.module.css";

/** ΔE below which two colours are effectively identical (mirrors the analysis). */
const INDISTINGUISHABLE_DELTA_E = 2;

type Verdict = "good" | "watch" | "review";

/** Which tab an overview verdict card links to. */
const VERDICT_TAB: Record<string, string> = {
  Colours: "colour",
  Type: "type",
  Spacing: "spacing",
  Radius: "radius",
  Shadows: "shadow",
  Motion: "motion",
};

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
    `${s.spacings} spacing ${plural(s.spacings, "value")}`,
  ];
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`;
}

/** Graduated verdict from a redundancy count: none = good, a few = watch, more = review. */
function redundancyVerdict(n: number): Verdict {
  return n === 0 ? "good" : n <= 2 ? "watch" : "review";
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
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const maxSpace = audit.spacing.reduce((m, v) => Math.max(m, v.value), 1);
  const maxBp = audit.breakpoints?.reduce((m, v) => Math.max(m, v.value), 1) ?? 1;
  const selectedSwatch = selectedHex
    ? (audit.colourFamilies.flatMap((f) => f.swatches).find((sw) => sw.hex === selectedHex) ?? null)
    : null;

  const offScale = s.typeOffScale ?? 0;
  const offGrid = s.spacingOffGrid ?? 0;
  const radiusDup = s.radiusNearDuplicates ?? 0;

  const verdicts: { label: string; n: number; chips: string[]; verdict: Verdict }[] = [
    {
      label: "Colours",
      n: s.distinctColours,
      verdict: redundancyVerdict(s.colourNearDuplicates),
      chips: [
        `${s.colourFamilies} ${plural(s.colourFamilies, "family", "families")}`,
        s.colourNearDuplicates > 0
          ? `${s.colourNearDuplicates} indistinguishable`
          : "no near-duplicates",
      ],
    },
    {
      label: "Type",
      n: s.typeSizes,
      verdict: redundancyVerdict(offScale),
      chips: [
        `${s.fontFamilies} ${plural(s.fontFamilies, "family", "families")}`,
        `${s.fontWeights} ${plural(s.fontWeights, "weight")}`,
        offScale > 0 ? `${offScale} off-scale` : "on a scale",
      ],
    },
    {
      label: "Spacing",
      n: s.spacings,
      verdict: redundancyVerdict(offGrid),
      chips: [offGrid > 0 ? `${offGrid} off a 4px grid` : "on a 4px grid"],
    },
    {
      label: "Radius",
      n: s.radii,
      verdict: radiusDup > 0 ? "watch" : "good",
      chips: [
        radiusDup > 0
          ? `${radiusDup} near-${plural(radiusDup, "duplicate")}`
          : s.radii === 0
            ? "none in use"
            : `${s.radii} ${plural(s.radii, "value")}`,
      ],
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
              {verdicts.map((v) => {
                const id = VERDICT_TAB[v.label];
                const hasTab = id != null && tabs.some((t) => t.id === id);
                const className = `${styles.verdict} ${styles[v.verdict]}${
                  hasTab ? ` ${styles.verdictClickable}` : ""
                }`;
                const body = (
                  <>
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
                  </>
                );
                return hasTab ? (
                  <button key={v.label} type="button" className={className} onClick={() => setTab(id)}>
                    {body}
                  </button>
                ) : (
                  <div key={v.label} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "colour" && (
          <>
            <Text role="body-sm" as="p" className={styles.tabIntro}>
              Grouped by hue family — click any colour for its role split, the elements that use it,
              and its nearest neighbour.
            </Text>
            {audit.colourFamilies.map((fam) => (
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
                    <ColourCard
                      key={sw.hex}
                      sw={sw}
                      totalPages={s.pages}
                      selected={selectedHex === sw.hex}
                      onSelect={() => setSelectedHex(sw.hex)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

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

            <TypeRuler sizes={t.sizes} />

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
          <>
            <SpacingRuler values={audit.spacing.map((v) => v.value)} />
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
          </>
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

      <Drawer
        open={selectedSwatch !== null}
        onClose={() => setSelectedHex(null)}
        title={selectedSwatch && <ColourDrawerTitle sw={selectedSwatch} totalPages={s.pages} />}
      >
        {selectedSwatch && (
          <ColourDetail sw={selectedSwatch} totalPages={s.pages} onPick={setSelectedHex} />
        )}
      </Drawer>
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

/**
 * Type scale ruler — the visual evidence for the "off-scale" verdict. Sizes are
 * plotted on a log axis against the closest modular scale's steps; sizes that
 * miss a step sit between ticks in red.
 */
function TypeRuler({ sizes }: { sizes: { px: number; count: number }[] }) {
  if (sizes.length < 2) return null;
  const px = sizes.map((s) => s.px);
  const base = sizes.reduce((a, b) => (b.count > a.count ? b : a)).px;
  const fit = detectClosestRatio(px, base);
  if (!fit) return null;

  const scale = buildScaleToCover(base, fit.ratio.ratio, Math.min(...px), Math.max(...px));
  const marks = classifyAgainstScale(px, scale);
  const lo = Math.log(scale[0]!.px);
  const hi = Math.log(scale.at(-1)!.px);
  const pos = (v: number) => (hi > lo ? ((Math.log(v) - lo) / (hi - lo)) * 100 : 50);
  const off = marks.filter((m) => !m.onScale).length;

  return (
    <Ruler
      title={`Closest scale · ${fit.ratio.name} (×${fit.ratio.ratio})`}
      note={off > 0 ? `${off} off-scale` : "all on scale"}
      ticks={scale.map((s) => ({ px: s.px, pos: pos(s.px) }))}
      dots={marks.map((m) => ({ px: m.px, pos: pos(m.px), on: m.onScale, nearest: m.nearestPx }))}
    />
  );
}

/** Spacing grid ruler — values on a linear axis against the 4px grid. */
function SpacingRuler({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const base = 4;
  const max = Math.max(...values, base);
  const step = max / base > 24 ? base * 2 : base; // keep the tick count sane
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const onGrid = (v: number) => Math.abs(v - Math.round(v / base) * base) <= 0.5;
  const pos = (v: number) => (max > 0 ? (v / max) * 100 : 0);
  const off = values.filter((v) => !onGrid(v)).length;

  return (
    <Ruler
      title="4px grid"
      note={off > 0 ? `${off} off grid` : "all on grid"}
      ticks={ticks.map((t) => ({ px: t, pos: pos(t) }))}
      dots={values.map((v) => ({ px: v, pos: pos(v), on: onGrid(v) }))}
    />
  );
}

interface RulerMark {
  px: number;
  pos: number;
  on?: boolean;
  nearest?: number;
}

function Ruler({
  title,
  note,
  ticks,
  dots,
}: {
  title: string;
  note: string;
  ticks: { px: number; pos: number }[];
  dots: RulerMark[];
}) {
  return (
    <div className={styles.ruler}>
      <div className={styles.rulerHead}>
        <Text role="label-sm" className={styles.rulerTitle}>
          {title}
        </Text>
        <Text role="label-xs" className={styles.rulerNote}>
          {note}
        </Text>
      </div>
      <div className={styles.rulerTrack}>
        <div className={styles.rulerLine} />
        {ticks.map((t) => (
          <span key={`t${t.px}`} className={styles.rulerTick} style={{ left: `${t.pos}%` }}>
            <span className={styles.rulerTickLabel}>{t.px}</span>
          </span>
        ))}
        {dots.map((d) => (
          <span
            key={`d${d.px}`}
            className={d.on ? styles.rulerDot : `${styles.rulerDot} ${styles.rulerDotOff}`}
            style={{ left: `${d.pos}%` }}
            title={`${d.px}px${d.on ? "" : d.nearest != null ? ` · off scale (nearest ${d.nearest})` : " · off grid"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ColourCard({
  sw,
  totalPages,
  selected,
  onSelect,
}: {
  sw: AuditColourSwatch;
  totalPages: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const dominant = ROLE_ORDER.map((r) => [r.short, sw.roles[r.key]] as const).reduce((a, b) =>
    b[1] > a[1] ? b : a,
  );
  const chips = usageChips(sw.count, totalPages, sw.pages.length);
  if (dominant[1] > 0) chips.push(`mostly ${dominant[0]}`);
  const isDup = sw.nearest != null && sw.nearest.deltaE < INDISTINGUISHABLE_DELTA_E;
  return (
    <button
      type="button"
      className={`${styles.card} ${styles.cardBtn}${selected ? ` ${styles.cardOn}` : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.swatchFill} style={{ background: sw.hex }} />
      <span className={styles.cardMeta}>
        <Text role="mono" className={styles.cardValue}>
          {sw.hex.toUpperCase()}
        </Text>
        <span className={styles.pills}>
          {chips.map((c) => (
            <span key={c} className={styles.pill}>
              {c}
            </span>
          ))}
          {isDup && <span className={`${styles.pill} ${styles.pillDup}`}>≈ ΔE {sw.nearest!.deltaE}</span>}
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

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** The drawer header: the swatch, its hex, and headline usage. */
function ColourDrawerTitle({ sw, totalPages }: { sw: AuditColourSwatch; totalPages: number }) {
  return (
    <div className={styles.drawerTitle}>
      <span className={styles.drawerSwatch} style={{ background: sw.hex }} />
      <div>
        <Text role="heading-sm" as="span" className={styles.drawerHex}>
          {sw.hex.toUpperCase()}
        </Text>
        <Text role="label-xs" className={styles.muted}>
          {usageText(sw.count, totalPages, sw.pages.length)}
        </Text>
      </div>
    </div>
  );
}

/** Drawer content for a colour: near-duplicate call-out, roles, elements, pages. */
function ColourDetail({
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
  const elements = sw.elements ?? [];
  const near = sw.nearest;
  const isDup = near != null && near.deltaE < INDISTINGUISHABLE_DELTA_E;

  return (
    <div className={styles.drawerContent}>
      {near && (
        <button
          type="button"
          className={isDup ? `${styles.nearCallout} ${styles.nearDup}` : styles.nearCallout}
          onClick={() => onPick(near.hex)}
        >
          <span className={styles.nearSwatch} style={{ background: near.hex }} />
          <span className={styles.nearText}>
            <Text role="body-sm">{isDup ? "Indistinguishable from" : "Nearest colour"}</Text>
            <Text role="mono" className={styles.nearHex}>
              {near.hex.toUpperCase()}
            </Text>
          </span>
          <Text role="mono" className={styles.nearDelta}>
            ΔE {near.deltaE}
          </Text>
        </button>
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
          <Text role="label-xs" className={styles.detailLabel}>
            Used by {elements.length} element {elements.length === 1 ? "type" : "types"}
          </Text>
          <div className={styles.elementList}>
            {elements.map((e) => (
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
