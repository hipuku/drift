/**
 * Colour proposal (Layer 2, "what it could be") — palette rationalisation.
 *
 * Not a blind merge. Only perceptually-identical colours doing the same job are
 * folded together; deliberate relatives (hover states, opacity variants) are
 * kept and named; and every token is named for the role it plays, because
 * `--color-3` is not something anyone can ship. Names are editable.
 *
 * Two things make it safe to actually apply: the migration map (old hex → new
 * token, with how much of the site it touches) and the contrast check, which
 * proves the proposed palette still passes AA rather than asking for trust.
 */

import { useMemo, useState } from "react";
import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import { ExportPanel } from "../../components/ExportPanel/ExportPanel.js";
import type { AuditColourFamily } from "../../lib/api.js";
import { analysePalette, migrationMap, type PaletteToken } from "../../lib/colourSemantics.js";
import { exportStringTokens, type StringTokenGroup } from "../../lib/exportTokens.js";
import { hueOf } from "../../lib/hue.js";
import styles from "./ColourProposal.module.css";

const GROUP: StringTokenGroup = { group: "color", dtcgType: "color", tailwindKey: "colors" };

const ROLE_LABEL: Record<string, string> = {
  text: "text",
  background: "background",
  border: "border",
};

interface Props {
  families: AuditColourFamily[];
  onBack?: () => void;
}

/** How hard to merge. 2 is the just-noticeable difference — the safe default. */
const THRESHOLDS: { value: number; label: string; hint: string }[] = [
  { value: 1, label: "Identical", hint: "ΔE 1 — only rounding artefacts" },
  { value: 2, label: "Safe", hint: "ΔE 2 — below what the eye can tell apart" },
  { value: 3, label: "Tidy", hint: "ΔE 3 — folds in slightly-off duplicates" },
  { value: 5, label: "Aggressive", hint: "ΔE 5 — may absorb deliberate states" },
];

export function ColourProposal({ families, onBack }: Props) {
  const [threshold, setThreshold] = useState(2);
  const proposal = useMemo(() => analysePalette(families, threshold), [families, threshold]);
  // Renames, keyed by the suggested name the engine produced.
  const [renames, setRenames] = useState<Record<string, string>>({});

  const nameOf = (t: PaletteToken): string => renames[t.name] ?? t.name;

  // Neutrals first, then by hue — so the palette reads as a palette.
  const tokens = useMemo(
    () => proposal.tokens.slice().sort((a, b) => hueOf(a.hex) - hueOf(b.hex) || b.count - a.count),
    [proposal.tokens],
  );

  const migration = useMemo(() => migrationMap(proposal.tokens), [proposal.tokens]);
  const failures = proposal.contrast.filter((c) => !c.passAA);

  const exportText = (format: Parameters<typeof exportStringTokens>[2]) =>
    exportStringTokens(
      GROUP,
      proposal.tokens.map((t) => ({ name: nameOf(t), value: t.hex })),
      format,
    );

  if (proposal.tokens.length === 0) {
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
          <strong>{proposal.distinct}</strong> colours become{" "}
          <strong>{proposal.tokens.length}</strong> named token
          {proposal.tokens.length === 1 ? "" : "s"} — {proposal.merged} merged as identical
          {proposal.variants > 0 ? `, ${proposal.variants} kept as states` : ""}. Only colours below
          ΔE {threshold} doing the same job are merged; anything further apart could be deliberate.
        </Text>
      </header>

      {/* How hard to merge — the one call the tool can't make for you. */}
      <div className={styles.thresholds} role="radiogroup" aria-label="Merge threshold">
        {THRESHOLDS.map((t) => {
          const active = t.value === threshold;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={t.hint}
              className={active ? `${styles.threshold} ${styles.thresholdOn}` : styles.threshold}
              onClick={() => setThreshold(t.value)}
            >
              <Text role="label">{t.label}</Text>
              <Text role="mono" className={styles.thresholdVal}>
                ΔE {t.value}
              </Text>
            </button>
          );
        })}
      </div>

      {/* The palette */}
      <div className={styles.clusters}>
        {tokens.map((t) => (
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
              <Text role="label-sm" className={styles.usage}>
                {ROLE_LABEL[t.role]} · used {t.count}× · {t.pages} page{t.pages === 1 ? "" : "s"}
                {t.tags.length ? ` · ${t.tags.join(", ")}` : ""}
              </Text>

              {t.members.length > 0 && (
                <div className={styles.members}>
                  <Badge variant="info">merged {t.members.length + 1} → 1</Badge>
                  {t.members.map((m) => (
                    <span key={m.hex} className={styles.member}>
                      <span className={styles.chip} style={{ background: m.hex }} aria-hidden="true" />
                      <span className={styles.memberHex}>
                        {m.hex} <span className={styles.de}>ΔE {m.deltaE.toFixed(1)}</span>
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {t.variants.length > 0 && (
                <div className={styles.members}>
                  {t.variants.map((v) => (
                    <span key={v.hex} className={styles.member}>
                      <span className={styles.chip} style={{ background: v.hex }} aria-hidden="true" />
                      <span className={styles.memberHex}>
                        {v.hex}
                        <span className={styles.de}> {v.kind === "hover" ? "state" : "opacity"}</span>
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Contrast — proof the palette still works, not a promise */}
      {proposal.contrast.length > 0 && (
        <section className={styles.panel} aria-label="Contrast">
          <div className={styles.panelHead}>
            <Text role="heading-sm" as="h2">
              Text on surfaces
            </Text>
            {failures.length > 0 ? (
              <Badge variant="warning">
                {failures.length} pair{failures.length === 1 ? "" : "s"} below AA
              </Badge>
            ) : (
              <Badge variant="neutral">every pair passes AA</Badge>
            )}
          </div>
          <div className={styles.rows}>
            {proposal.contrast.slice(0, 8).map((c) => (
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
        </section>
      )}

      {/* Migration map — the part that actually lets someone fix the site */}
      {migration.length > 0 && (
        <section className={styles.panel} aria-label="Migration">
          <div className={styles.panelHead}>
            <Text role="heading-sm" as="h2">
              What to replace
            </Text>
            <Badge variant="neutral">{migration.length} replacements</Badge>
          </div>
          <div className={styles.rows}>
            {migration.map((m) => (
              <div key={m.from} className={styles.migrateRow}>
                <span className={styles.chip} style={{ background: m.from }} aria-hidden="true" />
                <span className={styles.memberHex}>{m.from}</span>
                <span className={styles.arrow}>→</span>
                <span className={styles.chip} style={{ background: m.to }} aria-hidden="true" />
                <span className={styles.tokenName}>
                  {renames[proposal.tokens.find((t) => t.hex === m.to)?.name ?? m.token] ?? m.token}
                </span>
                <Text role="label-sm" className={styles.migrateCount}>
                  {m.count}×
                </Text>
              </div>
            ))}
          </div>
        </section>
      )}

      <ExportPanel render={exportText} />
    </main>
  );
}
