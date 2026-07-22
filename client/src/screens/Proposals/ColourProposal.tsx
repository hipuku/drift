/**
 * Colour proposal (Layer 2, "what it could be") — palette rationalisation.
 *
 * One job: turn the site's mess into a palette you can ship, and say what to
 * swap. So the screen shows four things and hides the rest.
 *
 * The size control is expressed in *tokens*, not ΔE — nobody arrives wanting a
 * perceptual distance of 3, they want fewer colours. ΔE stays an implementation
 * detail: we precompute the palette at each threshold and let the slider pick
 * between the outcomes that actually differ.
 *
 * Cards rest quiet (swatch, name, hex) and open for the evidence behind a merge.
 * Contrast is a one-line safety signal, not a workspace. The migration map is a
 * takeaway, so it lives in Export rather than on the page.
 */

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
 * The distinct palettes available, fewest tokens first. Thresholds that produce
 * a palette we've already seen are dropped, so every slider stop is a real
 * change rather than a dead zone.
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

  // Start at the safe default (ΔE 2 — below the just-noticeable difference).
  const defaultIndex = useMemo(() => {
    let best = 0;
    ladder.forEach((r, i) => {
      if (Math.abs(r.threshold - 2) < Math.abs(ladder[best]!.threshold - 2)) best = i;
    });
    return best;
  }, [ladder]);

  const [index, setIndex] = useState(defaultIndex);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showContrast, setShowContrast] = useState(false);

  const rung = ladder[Math.min(index, ladder.length - 1)];
  const proposal = rung?.proposal;

  const nameOf = (t: PaletteToken): string => renames[t.name] ?? t.name;

  const tokens = useMemo(
    () => (proposal?.tokens ?? []).slice().sort((a, b) => hueOf(a.hex) - hueOf(b.hex) || b.count - a.count),
    [proposal],
  );

  const failures = proposal?.contrast.filter((c) => !c.passAA) ?? [];

  const renderExport = (format: ColourExport): string => {
    if (!proposal) return "";
    if (format === "replacements") {
      const rows = migrationMap(proposal.tokens);
      if (rows.length === 0) return "/* Nothing to replace — every colour is already its own token. */";
      const named = rows.map((r) => {
        const token = proposal.tokens.find((t) => t.hex === r.to);
        return `${r.from}  →  var(--${GROUP.group}-${token ? nameOf(token) : r.token})  /* ${r.count} uses */`;
      });
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
          Your <strong>{proposal.distinct}</strong> colours become{" "}
          <strong>{proposal.tokens.length}</strong> tokens you can ship.
        </Text>
      </header>

      {/* Palette size, in the only unit that means anything here: tokens. */}
      {ladder.length > 1 && (
        <div className={styles.sizer}>
          <label className={styles.sizerLabel} htmlFor="palette-size">
            <span>fewer</span>
            <input
              id="palette-size"
              className={styles.slider}
              type="range"
              min={0}
              max={ladder.length - 1}
              step={1}
              value={Math.min(index, ladder.length - 1)}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
            <span>truer</span>
          </label>
          <Text role="label-sm" className={styles.sizerCount}>
            {proposal.tokens.length} tokens
          </Text>
        </div>
      )}

      {/* Safety signal — a line, not a panel. */}
      {proposal.contrast.length > 0 && (
        <div className={styles.safety}>
          <button
            type="button"
            className={styles.safetyToggle}
            onClick={() => setShowContrast((s) => !s)}
            aria-expanded={showContrast}
          >
            {failures.length === 0 ? (
              <Badge variant="neutral">✓ All text passes AA</Badge>
            ) : (
              <Badge variant="warning">
                {failures.length} text pair{failures.length === 1 ? "" : "s"} below AA
              </Badge>
            )}
            <span className={styles.safetyMore}>{showContrast ? "hide" : "check"}</span>
          </button>
          {showContrast && (
            <div className={styles.rows}>
              {proposal.contrast.map((c) => (
                <div key={`${c.fg}-${c.bg}`} className={styles.contrastRow}>
                  <span className={styles.pairSwatch} style={{ background: c.bg }}>
                    <span style={{ color: c.fg }}>Aa</span>
                  </span>
                  <Text role="label-sm" className={styles.pairName}>
                    {c.fgName} on {c.bgName}
                  </Text>
                  <Badge variant={c.passAA ? "neutral" : "warning"} mono>
                    {c.ratio.toFixed(1)}:1
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The palette. Quiet at rest; the evidence is one click away. */}
      <div className={styles.clusters}>
        {tokens.map((t) => {
          const isOpen = open === t.name;
          const extras = t.members.length + t.variants.length;
          return (
            <div key={t.hex + t.name} className={styles.cluster}>
              <div className={styles.swatch} style={{ background: t.hex }} aria-hidden="true" />
              <div className={styles.body}>
                <div className={styles.rowTop}>
                  <input
                    className={styles.nameInput}
                    value={nameOf(t)}
                    onChange={(e) => setRenames((r) => ({ ...r, [t.name]: e.target.value }))}
                    aria-label={`Token name for ${t.hex}`}
                    spellCheck={false}
                  />
                  <Text role="mono" className={styles.hex}>
                    {t.hex}
                  </Text>
                </div>

                {extras > 0 && (
                  <button
                    type="button"
                    className={styles.expand}
                    onClick={() => setOpen(isOpen ? null : t.name)}
                    aria-expanded={isOpen}
                  >
                    +{extras} folded in
                  </button>
                )}

                {isOpen && (
                  <div className={styles.detail}>
                    <Text role="label-sm" className={styles.usage}>
                      {t.role} · used {t.count}× · {t.pages} page{t.pages === 1 ? "" : "s"}
                      {t.tags.length ? ` · ${t.tags.join(", ")}` : ""}
                    </Text>
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
                          {v.hex} <span className={styles.de}>kept as {v.kind === "hover" ? "a state" : "an opacity"}</span>
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
    </main>
  );
}
