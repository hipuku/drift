/**
 * Colour proposal (Layer 2, "what it could be") — palette rationalisation.
 *
 * Drift is reductive, never generative: every token here is a colour the site
 * already ships. The job is to slim the palette down and say what to swap.
 *
 * The size control reads in tokens, not ΔE, with the ΔE shown as a readout and
 * a healthy band marking what a website palette usually needs (~10–16). The
 * contrast panel is inverted from the obvious design: instead of listing the
 * pairs that fail — most of a big palette, alarming and useless — it lists the
 * pairs that *pass*, which turns it into a pairing guide and makes nonsense
 * combinations disappear on their own.
 */

import { faArrowDownAZ, faCheck, faDroplet, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditColourFamily } from "../../lib/api.js";
import {
  analysePalette,
  migrationMap,
  type PaletteProposal,
  type PaletteToken,
} from "../../lib/colourSemantics.js";
import { exportStringTokens, type StringTokenGroup } from "../../lib/exportTokens.js";
import { hueOf } from "../../lib/hue.js";
import styles from "./ColourProposal.module.css";

const GROUP: StringTokenGroup = { group: "color", dtcgType: "color", tailwindKey: "colors" };

/** What a website palette usually needs: 1–2 brand hues, a neutral ramp, maybe status. */
const HEALTHY_MIN = 10;
const HEALTHY_MAX = 16;

type ColourExport = "css" | "tailwind" | "dtcg" | "replacements";
const FORMATS: { id: ColourExport; label: string }[] = [
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "dtcg", label: "DTCG" },
  { id: "replacements", label: "Replacements" },
];

interface Props {
  families: AuditColourFamily[];
  onBack?: () => void;
}

interface Rung {
  threshold: number;
  proposal: PaletteProposal;
}

/**
 * The distinct palettes available, fewest tokens first. Thresholds producing a
 * palette we've already seen are dropped, so every slider stop is a real change.
 */
function buildLadder(families: AuditColourFamily[]): Rung[] {
  const bySize = new Map<number, Rung>();
  for (let t = 6; t >= 1; t -= 0.5) {
    const proposal = analysePalette(families, t);
    if (!bySize.has(proposal.tokens.length)) bySize.set(proposal.tokens.length, { threshold: t, proposal });
  }
  return [...bySize.values()].sort((a, b) => a.proposal.tokens.length - b.proposal.tokens.length);
}

export function ColourProposal({ families, onBack }: Props) {
  const ladder = useMemo(() => buildLadder(families), [families]);

  const defaultIndex = useMemo(() => {
    let best = 0;
    ladder.forEach((r, i) => {
      if (Math.abs(r.threshold - 2) < Math.abs(ladder[best]!.threshold - 2)) best = i;
    });
    return best;
  }, [ladder]);

  const [index, setIndex] = useState(defaultIndex);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [openToken, setOpenToken] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [sort, setSort] = useState<"hue" | "alpha">("hue");

  const rung = ladder[Math.min(index, ladder.length - 1)];
  const proposal = rung?.proposal;

  const nameOf = (t: PaletteToken): string => renames[t.name] ?? t.name;

  /** Resolve a hex to its current (possibly renamed) token name. */
  const displayName = (hex: string): string => {
    const t = proposal?.tokens.find((x) => x.hex === hex);
    return t ? nameOf(t) : hex;
  };

  const tokens = useMemo(() => {
    const list = (proposal?.tokens ?? []).slice();
    if (sort === "alpha") {
      return list.sort((a, b) =>
        (renames[a.name] ?? a.name).localeCompare(renames[b.name] ?? b.name),
      );
    }
    return list.sort((a, b) => hueOf(a.hex) - hueOf(b.hex) || b.count - a.count);
  }, [proposal, sort, renames]);

  /** Safe pairs grouped by the background they sit on. */
  const byBackground = useMemo(() => {
    const map = new Map<string, PaletteProposal["contrast"]>();
    for (const c of proposal?.contrast ?? []) {
      const list = map.get(c.bg) ?? [];
      list.push(c);
      map.set(c.bg, list);
    }
    return [...map.entries()];
  }, [proposal]);

  // Where on the track a healthy palette sits, for the band above the slider.
  const band = useMemo(() => {
    if (ladder.length < 2) return null;
    const inRange = ladder
      .map((r, i) => ({ i, n: r.proposal.tokens.length }))
      .filter((x) => x.n >= HEALTHY_MIN && x.n <= HEALTHY_MAX);
    if (inRange.length === 0) return null;
    const span = ladder.length - 1;
    return {
      left: (inRange[0]!.i / span) * 100,
      width: ((inRange[inRange.length - 1]!.i - inRange[0]!.i) / span) * 100,
    };
  }, [ladder]);

  const count = proposal?.tokens.length ?? 0;
  const isHealthy = count >= HEALTHY_MIN && count <= HEALTHY_MAX;

  const renderExport = (format: ColourExport): string => {
    if (!proposal) return "";
    if (format === "replacements") {
      const rows = migrationMap(proposal.tokens);
      if (rows.length === 0) return "/* Nothing to replace — every colour is already its own token. */";
      const named = rows.map(
        (r) => `${r.from}  →  var(--${GROUP.group}-${displayName(r.to)})  /* ${r.count} uses */`,
      );
      return `/* Replace ${rows.length} colour${rows.length === 1 ? "" : "s"} */\n${named.join("\n")}`;
    }
    return exportStringTokens(
      GROUP,
      proposal.tokens.map((t) => ({ name: nameOf(t), value: t.hex })),
      format,
    );
  };

  if (!proposal || proposal.tokens.length === 0) {
    return (
      <main className={styles.page}>
        <header className={styles.head}>
          {onBack && (
            <button type="button" className={styles.back} onClick={onBack}>
              ← Back to proposals
            </button>
          )}
          <Text role="heading-lg" as="h1">
            What your colour set could be
          </Text>
          <Text role="body" as="p" className={styles.intro}>
            No colours were extracted from the crawled pages.
          </Text>
        </header>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={railOpen ? `${styles.layout} ${styles.layoutOpen}` : styles.layout}>
        <div className={styles.mainCol}>
          <header className={styles.head}>
            {onBack && (
              <button type="button" className={styles.back} onClick={onBack}>
                ← Back to proposals
              </button>
            )}
            <Text role="heading-lg" as="h1">
              What your colour set could be
            </Text>
            <Text role="body" as="p" className={styles.intro}>
              Your <strong>{proposal.distinct}</strong> colours become <strong>{count}</strong> tokens
              you can ship — all of them colours you already use.
            </Text>
          </header>

          {/* Size, in tokens. ΔE is a readout, never the control. */}
          {ladder.length > 1 && (
            <div className={styles.sizer}>
              <div className={styles.sliderCol}>
                <div className={styles.bandTrack} aria-hidden="true">
                  {band && (
                    <span
                      className={styles.band}
                      style={{ left: `${band.left}%`, width: `${band.width}%` }}
                    />
                  )}
                </div>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderEnd}>fewer</span>
                  <input
                    id="palette-size"
                    className={styles.slider}
                    type="range"
                    min={0}
                    max={ladder.length - 1}
                    step={1}
                    value={Math.min(index, ladder.length - 1)}
                    onChange={(e) => setIndex(Number(e.target.value))}
                    aria-label="Palette size"
                  />
                  <span className={styles.sliderEnd}>truer</span>
                </div>
              </div>
              <div className={styles.readout}>
                <Badge variant="neutral" mono>
                  ΔE {rung!.threshold}
                </Badge>
                <Badge variant={isHealthy ? "info" : "neutral"}>{count} tokens</Badge>
              </div>
            </div>
          )}
          {band && (
            <Text role="label-sm" className={styles.bandHint}>
              A website usually needs {HEALTHY_MIN}–{HEALTHY_MAX} tokens — marked on the track.
            </Text>
          )}

          {/* Sort at one end, the pairing guide at the other. */}
          <div className={styles.controls}>
            <div className={styles.sortRow} role="tablist" aria-label="Sort palette">
              <button
                type="button"
                role="tab"
                aria-selected={sort === "hue"}
                aria-label="Sort by hue"
                title="Sort by hue"
                className={sort === "hue" ? `${styles.sortTab} ${styles.sortTabOn}` : styles.sortTab}
                onClick={() => setSort("hue")}
              >
                <FontAwesomeIcon icon={faDroplet} />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sort === "alpha"}
                aria-label="Sort A to Z"
                title="Sort A–Z"
                className={sort === "alpha" ? `${styles.sortTab} ${styles.sortTabOn}` : styles.sortTab}
                onClick={() => setSort("alpha")}
              >
                <FontAwesomeIcon icon={faArrowDownAZ} />
              </button>
            </div>

            <button
              type="button"
              className={styles.safetyToggle}
              onClick={() => setRailOpen((r) => !r)}
              aria-expanded={railOpen}
            >
              <Badge variant="neutral">{proposal.contrast.length} safe combinations</Badge>
            </button>
          </div>

          {/* The palette. */}
          <div className={styles.clusters}>
            {tokens.map((t) => {
              const isOpen = openToken === t.name;
              const isEditing = editing === t.name;
              const opacities = t.variants.filter((v) => v.kind === "opacity").length;
              const states = t.variants.filter((v) => v.kind === "hover").length;
              const inputId = `token-${t.hex.replace(/[^a-z0-9]/gi, "")}`;
              return (
                <div key={t.hex + t.name} className={styles.cluster}>
                  <div className={styles.swatch} style={{ background: t.hex }} aria-hidden="true" />
                  <div className={styles.body}>
                    <div className={styles.rowTop}>
                      <span className={styles.nameWrap}>
                        <input
                          id={inputId}
                          className={styles.nameInput}
                          value={nameOf(t)}
                          style={{ width: `${Math.max(nameOf(t).length, 3) + 1}ch` }}
                          onChange={(e) => setRenames((r) => ({ ...r, [t.name]: e.target.value }))}
                          onFocus={() => setEditing(t.name)}
                          onBlur={() => setEditing(null)}
                          aria-label={`Token name for ${t.hex}`}
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className={styles.editBtn}
                          aria-label={isEditing ? `Done renaming ${nameOf(t)}` : `Rename ${nameOf(t)}`}
                          // Without this the button takes focus on click, which
                          // blurs the input we just focused and drops us straight
                          // back out of editing.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const el = document.getElementById(inputId) as HTMLInputElement | null;
                            if (isEditing) el?.blur();
                            else el?.focus();
                          }}
                        >
                          <FontAwesomeIcon icon={isEditing ? faCheck : faPencil} />
                        </button>
                      </span>
                      <Text role="mono" className={styles.hex}>
                        {t.hex}
                      </Text>
                    </div>

                    {/* Always present — the attribution is the evidence. */}
                    <Text role="label-sm" className={styles.usage}>
                      {t.role} · used {t.count}× · {t.pages} page{t.pages === 1 ? "" : "s"}
                      {t.tags.length ? ` · ${t.tags.join(", ")}` : ""}
                    </Text>

                    {(t.members.length > 0 || opacities > 0 || states > 0) && (
                      <button
                        type="button"
                        className={styles.pillRow}
                        onClick={() => setOpenToken(isOpen ? null : t.name)}
                        aria-expanded={isOpen}
                      >
                        {t.members.length > 0 && <Badge variant="info">{t.members.length} merged</Badge>}
                        {opacities > 0 && <Badge variant="neutral">{opacities} opacity kept</Badge>}
                        {states > 0 && <Badge variant="neutral">{states} state kept</Badge>}
                      </button>
                    )}

                    {isOpen && (
                      <div className={styles.detail}>
                        {t.members.map((m) => (
                          <span key={m.hex} className={styles.member}>
                            <span className={styles.chip} style={{ background: m.hex }} aria-hidden="true" />
                            <span className={styles.memberHex}>
                              {m.hex} <span className={styles.de}>merged · ΔE {m.deltaE.toFixed(1)}</span>
                            </span>
                          </span>
                        ))}
                        {t.variants.map((v) => (
                          <span key={v.hex} className={styles.member}>
                            <span className={styles.chip} style={{ background: v.hex }} aria-hidden="true" />
                            <span className={styles.memberHex}>
                              {v.hex}{" "}
                              <span className={styles.de}>
                                kept · {v.kind === "hover" ? "a state" : "lower opacity"}
                              </span>
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <ExportPanel formats={FORMATS} render={renderExport} />
        </div>

        {/* Pairing guide — the combinations that work, grouped by background. */}
        {railOpen && (
          <aside className={styles.rail} aria-label="Safe combinations">
            <div className={styles.railInner}>
              <div className={styles.railHeader}>
                <Text role="heading-sm" as="h2">
                  Safe combinations
                </Text>
                <button
                  type="button"
                  className={styles.railClose}
                  onClick={() => setRailOpen(false)}
                  aria-label="Close"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              <div className={styles.railBody}>
                {byBackground.length === 0 && (
                  <Text role="body-sm" className={styles.usage}>
                    No pair in this palette reaches AA. Try a truer palette.
                  </Text>
                )}
                {byBackground.map(([bg, pairs]) => (
                  <div key={bg} className={styles.railGroup}>
                    <div className={styles.railGroupHead}>
                      <span className={styles.chip} style={{ background: bg }} aria-hidden="true" />
                      <Text role="label" className={styles.railGroupName}>
                        on {displayName(bg)}
                      </Text>
                    </div>
                    {pairs.map((c) => (
                      <div key={`${c.fg}-${c.bg}`} className={styles.contrastRow}>
                        <span className={styles.pairSwatch} style={{ background: c.bg }}>
                          <span style={{ color: c.fg }}>Aa</span>
                        </span>
                        <Text role="label-sm" className={styles.pairName}>
                          {displayName(c.fg)}
                        </Text>
                        <Badge variant="neutral" mono>
                          {c.ratio.toFixed(1)}:1
                        </Badge>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
