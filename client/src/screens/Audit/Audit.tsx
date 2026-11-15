/**
 * The Audit, Stage 1, "what it is".
 *
 * Two presentation modes, chosen by what the token *is*:
 *  - Cards for tokens you judge visually, colour swatches, type families,
 *    shadows, gradients. A specimen with its value and usage.
 *  - Tables for scalar tokens, the type scale, spacing, radius, borders, etc.
 *    A small specimen, the value, and usage, in aligned rows with dividers.
 *
 * Overview is the diagnosis: a synthesised health line plus verdict cards
 * tinted green / orange / red (good / watch / needs-review) with the detail as
 * pills. The colour, and a bottom accent rule, is the verdict.
 */

import {
  faBolt,
  faBorderStyle,
  faChartSimple,
  faCircleHalfStroke,
  faClone,
  faDesktop,
  faDroplet,
  faFillDrip,
  faFont,
  faLayerGroup,
  faPalette,
  faRulerHorizontal,
  faShapes,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import type { AuditAuthored, SiteAudit } from "../../lib/api.js";
import { detectClosestRatio } from "../../lib/typeScale.js";
import { buildExport, buildVerdicts, offScaleSet, typeBasePxOf } from "./diagnosis.js";
import {
  cardId,
  tabId,
  tabPanelId,
  extendedDriftAreas,
  healthLine,
  hostOf,
  plural,
  type DisplayUnit,
} from "./auditModel.js";
import {
  BlurSection,
  BorderSection,
  BreakpointSection,
  ContrastSection,
  GradientSection,
  MotionSection,
  OpacitySection,
  RadiusSection,
  ShadowSection,
  ZIndexSection,
} from "./sections/scalarSections.js";
import { ColourCard, ColourDetail, ColourDrawerTitle } from "./parts/colour.js";
import { OverviewSection } from "./sections/overviewSection.js";
import { SpacingSection, TypeSection } from "./sections/scaleSections.js";
import styles from "./Audit.module.css";

/** An icon per token tab, gives the strip identity and speeds scanning. */
const TAB_ICON: Record<string, IconDefinition> = {
  overview: faChartSimple,
  colour: faPalette,
  contrast: faCircleHalfStroke,
  type: faFont,
  spacing: faRulerHorizontal,
  radius: faShapes,
  shadow: faClone,
  border: faBorderStyle,
  opacity: faCircleHalfStroke,
  zindex: faLayerGroup,
  blur: faDroplet,
  breakpoint: faDesktop,
  gradient: faFillDrip,
  motion: faBolt,
};

interface Props {
  audit: SiteAudit;
  onBack?: () => void;
}

export function Audit({ audit, onBack }: Props) {
  const s = audit.summary;
  const t = audit.typography;
  const family = t.families[0]?.family ?? null;
  const fontStack = family
    ? `'${family}', var(--drift-type-family-sans)`
    : "var(--drift-type-family-sans)";

  const tabs = useMemo(() => {
    const list = [
      { id: "overview", label: "Overview", count: null as number | null },
      { id: "colour", label: "Colour", count: s.distinctColours },
      ...(audit.contrast?.length
        ? [{ id: "contrast", label: "Contrast", count: audit.contrast.length }]
        : []),
      { id: "type", label: "Type", count: s.typeSizes },
      { id: "spacing", label: "Spacing", count: s.spacings },
    ];
    if (audit.radius.length) list.push({ id: "radius", label: "Radius", count: s.radii });
    if (audit.shadow.length) list.push({ id: "shadow", label: "Shadow", count: s.shadows });
    if (audit.borders?.length)
      list.push({ id: "border", label: "Border", count: audit.borders.length });
    if (audit.opacity?.length)
      list.push({ id: "opacity", label: "Opacity", count: audit.opacity.length });
    if (audit.zIndex?.length)
      list.push({ id: "zindex", label: "Z-index", count: audit.zIndex.length });
    if (audit.blur?.length) list.push({ id: "blur", label: "Blur", count: audit.blur.length });
    if (audit.breakpoints?.length)
      list.push({ id: "breakpoint", label: "Breakpoints", count: audit.breakpoints.length });
    if (audit.gradients?.length)
      list.push({ id: "gradient", label: "Gradient", count: audit.gradients.length });
    if (audit.motion && (audit.motion.durations.length || audit.motion.easings.length))
      list.push({
        id: "motion",
        label: "Motion",
        count: audit.motion.durations.length + audit.motion.easings.length,
      });
    return list;
  }, [s, audit]);

  const [tab, setTab] = useState("overview");
  const [pickedHex, setSelectedHex] = useState<string | null>(null);
  const [flashHex, setFlashHex] = useState<string | null>(null);

  // Picking a neighbour from the rail: swap the detail to it, then scroll its
  // card into view on the left and flash it so the jump stays legible.
  const pickColour = useCallback((hex: string) => {
    setSelectedHex(hex);
    setFlashHex(hex);
    requestAnimationFrame(() => {
      document.getElementById(cardId(hex))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    if (!flashHex) return;
    const t = setTimeout(() => setFlashHex(null), 1100);
    return () => clearTimeout(t);
  }, [flashHex]);

  // The detail rail belongs to the Colour tab, leaving it closes the rail.
  // Derived rather than cleared in an effect: the rail's visibility is a
  // function of the current tab, so computing it during render avoids the
  // extra pass a reset effect would schedule.
  const selectedHex = tab === "colour" ? pickedHex : null;

  // ── Reference scales ────────────────────────────────────────────────────────
  // "Off-scale" is a measurement against a reference, so the reference is
  // selectable: compare the system against any named ratio, or against a 4px or
  // 8px grid. The selection drives this section's ruler and table together; the
  // Overview verdict stays pinned to the automatic best fit, so exploring a
  // hypothetical never rewrites the diagnosis.
  const typeBasePx = typeBasePxOf(t.sizes);
  /** The automatic fit, ranked the same way as the server's `typeOffScale`. */
  const bestRatio = useMemo(
    () =>
      detectClosestRatio(
        t.sizes.map((z) => z.px),
        typeBasePx,
      )?.ratio ?? null,
    [t.sizes, typeBasePx],
  );

  /** Sizes that miss a given ratio, the ruler's red dots and the table's. */
  const offScaleFor = useCallback(
    (ratio: number): Set<number> => offScaleSet(t.sizes, typeBasePx, ratio),
    [t.sizes, typeBasePx],
  );

  const extendedDrift = useMemo(
    () => extendedDriftAreas(audit.borders, audit.zIndex),
    [audit.borders, audit.zIndex],
  );
  const selectedSwatch = selectedHex
    ? (audit.colourFamilies.flatMap((f) => f.swatches).find((sw) => sw.hex === selectedHex) ?? null)
    : null;

  const verdicts = useMemo(() => buildVerdicts(audit), [audit]);

  /** Downloads `buildExport`'s payload, dated so successive audits of one site sort. */
  const exportJson = () => {
    const generatedAt = new Date();
    const payload = buildExport(audit, generatedAt);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `drift-audit-${hostOf(audit.rootUrl)}-${generatedAt.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  // Type scale rows, one per distinct size (largest first), so the table matches
  // the ruler and the tab count, with every weight and the tags that use it.
  // Sizes that miss the closest modular scale, mirrors the ruler's red dots.

  /**
   * Lead each scalar table with the unit the site actually authors in, rather
   * than a toggle the reader has to discover. `authored` reads the real unit
   * per category off the stylesheets, so a rem-authored type scale reads in rem
   * and a px-authored one reads in px. The choice is a finding, not a setting.
   */
  const unitFor = useCallback(
    (category: AuditAuthored["categories"][number]["category"]): DisplayUnit =>
      audit.authored?.categories.find((c) => c.category === category)?.dominant === "rem"
        ? "rem"
        : "px",
    [audit.authored],
  );

  return (
    <div className={styles.page}>
      <div className={`${styles.layout}${selectedSwatch ? ` ${styles.layoutOpen}` : ""}`}>
        <div className={styles.main}>
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
                  Values in use across {s.pages} {plural(s.pages, "page")}.
                </Text>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={exportJson}>
                  Export
                </button>
              </div>
            </div>

            {/* ⛔ The whole tablist pattern, not half of it. This carried role="tab"
            and aria-selected and nothing else: no aria-controls, no tabpanel to
            point at, and no arrow keys. A tab that only answers a click is a
            tablist in appearance, which is what the end-to-end suite's comment
            claimed it was testing while its assertion could not fail: with no
            arrow handling the selected tab never moved, so "the selected tab is
            focused" held on every iteration of the walk.

            Roving tabindex, so the tablist is one stop and the arrows move
            inside it rather than Tab landing on each of eight buttons. */}
            {/* eslint-disable-next-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: focus sits on the tabs, and their key events bubble to this handler */}
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Audit sections"
              onKeyDown={(e) => {
                const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
                if (!keys.includes(e.key)) return;
                e.preventDefault();
                const i = tabs.findIndex((t) => t.id === tab);
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                const id = tabs[next]!.id;
                setTab(id);
                /* Focus follows selection, which is what the pattern asks for and
               what makes the panel readable without a second keystroke. The
               button is already rendered, so it can be focused now. */
                document.getElementById(tabId(id))?.focus();
              }}
            >
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  id={tabId(tb.id)}
                  type="button"
                  role="tab"
                  aria-selected={tab === tb.id}
                  aria-controls={tabPanelId(tb.id)}
                  tabIndex={tab === tb.id ? 0 : -1}
                  className={tab === tb.id ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                  onClick={() => setTab(tb.id)}
                >
                  {TAB_ICON[tb.id] && (
                    <FontAwesomeIcon icon={TAB_ICON[tb.id]!} className={styles.tabIcon} />
                  )}
                  {tb.label}
                  {tb.count != null && <span className={styles.tabCount}>{tb.count}</span>}
                </button>
              ))}
            </div>
          </header>

          {/* The other half. tabIndex 0 because a panel whose content has no
          focusable element still has to be reachable, or the tab selects
          something a keyboard cannot then read. */}
          <div
            className={styles.panel}
            key={tab}
            id={tabPanelId(tab)}
            role="tabpanel"
            aria-labelledby={tabId(tab)}
            tabIndex={0}
          >
            {tab === "overview" && (
              <OverviewSection
                health={healthLine(s, extendedDrift)}
                verdicts={verdicts}
                authored={audit.authored}
                tabIcon={TAB_ICON}
                hasTab={(id) => tabs.some((tb) => tb.id === id)}
                onGoToTab={setTab}
              />
            )}

            {tab === "colour" && (
              <>
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
                          id={cardId(sw.hex)}
                          selected={selectedHex === sw.hex}
                          flash={flashHex === sw.hex}
                          onSelect={() => setSelectedHex(sw.hex)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === "type" && (
              <TypeSection
                typography={t}
                pages={s.pages}
                fontStack={fontStack}
                unit={unitFor("type")}
                bestRatio={bestRatio}
                offScaleFor={offScaleFor}
              />
            )}

            {tab === "spacing" && (
              <SpacingSection spacing={audit.spacing} unit={unitFor("spacing")} />
            )}

            {tab === "radius" && <RadiusSection radius={audit.radius} unit={unitFor("radius")} />}

            {tab === "shadow" && <ShadowSection shadow={audit.shadow} />}

            {tab === "gradient" && audit.gradients && (
              <GradientSection gradients={audit.gradients} />
            )}

            {tab === "border" && audit.borders && (
              <BorderSection borders={audit.borders} unit={unitFor("border")} />
            )}

            {tab === "contrast" && audit.contrast && <ContrastSection contrast={audit.contrast} />}

            {tab === "opacity" && audit.opacity && <OpacitySection opacity={audit.opacity} />}

            {tab === "zindex" && audit.zIndex && <ZIndexSection zIndex={audit.zIndex} />}

            {tab === "blur" && audit.blur && <BlurSection blur={audit.blur} />}

            {tab === "breakpoint" && audit.breakpoints && (
              <BreakpointSection breakpoints={audit.breakpoints} />
            )}

            {tab === "motion" && audit.motion && <MotionSection motion={audit.motion} />}
          </div>
        </div>

        {selectedSwatch && (
          <aside className={styles.rail}>
            <div className={styles.railInner}>
              <div className={styles.railHeader}>
                <div key={selectedSwatch.hex} className={styles.railFade}>
                  <ColourDrawerTitle sw={selectedSwatch} totalPages={s.pages} />
                </div>
                <button
                  type="button"
                  className={styles.railClose}
                  onClick={() => setSelectedHex(null)}
                  aria-label="Close detail"
                >
                  ✕
                </button>
              </div>
              <div className={styles.railBody}>
                <div key={selectedSwatch.hex} className={styles.railFade}>
                  <ColourDetail sw={selectedSwatch} totalPages={s.pages} onPick={pickColour} />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
