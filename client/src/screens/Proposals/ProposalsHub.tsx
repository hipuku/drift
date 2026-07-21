/**
 * Proposals hub — the entry to Layer 2 ("what it could be").
 *
 * Not a flat menu: each token carries its drift signal from the audit (near-
 * duplicate colours, off-scale sizes, off-grid spacing) and the cards sort
 * worst-first, so the hub reads as "here's where your system is drifting most,
 * start there". New token proposals plug in by contributing a signal. Extensible.
 */

import { Text } from "../../components/Text/Text.js";
import type { SiteAudit } from "../../lib/api.js";
import styles from "./ProposalsHub.module.css";

export type ProposalKind = "type" | "colour" | "spacing" | "radius";

type Summary = SiteAudit["summary"];

interface Props {
  onSelect: (kind: ProposalKind) => void;
  onBack?: () => void;
  /** The audit summary, for per-token drift signals. Omitted in some harness views. */
  summary?: Summary;
}

interface CardMeta {
  kind: ProposalKind;
  title: string;
  blurb: string;
  /** Drift count and its noun, derived from the summary. */
  signal: (s: Summary) => { count: number; noun: string };
}

const META: CardMeta[] = [
  {
    kind: "colour",
    title: "Colour",
    blurb: "Consolidate near-identical colours to one token each.",
    signal: (s) => ({ count: s.colourNearDuplicates ?? 0, noun: "near-duplicate" }),
  },
  {
    kind: "type",
    title: "Type scale",
    blurb: "Project your base size onto a modular scale, in your font.",
    signal: (s) => ({ count: s.typeOffScale ?? 0, noun: "size off-scale" }),
  },
  {
    kind: "spacing",
    title: "Spacing",
    blurb: "Snap ad-hoc spacing to a clean base grid.",
    signal: (s) => ({ count: s.spacingOffGrid ?? 0, noun: "value off-grid" }),
  },
  {
    kind: "radius",
    title: "Radius",
    blurb: "Fit corner radii to a canonical named ramp.",
    signal: (s) => ({ count: s.radiusNearDuplicates ?? 0, noun: "near-duplicate" }),
  },
];

const plural = (n: number, noun: string): string => {
  // Pluralise the head noun of "size off-scale" / "value off-grid" / "near-duplicate".
  if (n === 1) return noun;
  const [head, ...rest] = noun.split(" ");
  return [`${head}s`, ...rest].join(" ");
};

export function ProposalsHub({ onSelect, onBack, summary }: Props) {
  const cards = META.map((m) => {
    const sig = summary ? m.signal(summary) : { count: 0, noun: "" };
    return { ...m, count: sig.count, noun: sig.noun };
  }).sort((a, b) => b.count - a.count);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to audit
          </button>
        )}
        <Text role="heading-lg" as="h1">
          Proposals
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          Your tokens, projected onto known-good structures — worst drift first. Preview, apply, and export.
        </Text>
      </header>

      <div className={styles.cards}>
        {cards.map((card) => (
          <button key={card.kind} type="button" className={styles.card} onClick={() => onSelect(card.kind)}>
            <div className={styles.cardHead}>
              <Text role="heading-sm" as="span">
                {card.title}
              </Text>
              {summary &&
                (card.count > 0 ? (
                  <span className={styles.signal}>
                    {card.count} {plural(card.count, card.noun)}
                  </span>
                ) : (
                  <span className={styles.signalClean}>no drift</span>
                ))}
            </div>
            <Text role="body-sm" className={styles.blurb}>
              {card.blurb}
            </Text>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
