/**
 * Proposals hub — the entry to Layer 2 ("what it could be").
 *
 * A small chooser between the deterministic proposal categories. Extensible:
 * spacing and radius slot in here as they're built.
 */

import { Text } from "../../components/Text/Text.js";
import styles from "./ProposalsHub.module.css";

export type ProposalKind = "type" | "colour";

interface Props {
  onSelect: (kind: ProposalKind) => void;
  onBack?: () => void;
}

const CARDS: { kind: ProposalKind; title: string; blurb: string }[] = [
  { kind: "type", title: "Type scale", blurb: "Project your base size onto a modular scale, in your font." },
  { kind: "colour", title: "Colour", blurb: "Consolidate near-identical colours to one token each." },
];

export function ProposalsHub({ onSelect, onBack }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to audit
          </button>
        )}
        <Text role="label-xs" as="p" className={styles.eyebrow}>
          What it could be
        </Text>
        <Text role="heading-lg" as="h1">
          Proposals
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          Your tokens, projected onto known-good structures. Preview, apply, and export — all
          computed, no model.
        </Text>
      </header>

      <div className={styles.cards}>
        {CARDS.map((card) => (
          <button key={card.kind} type="button" className={styles.card} onClick={() => onSelect(card.kind)}>
            <Text role="heading-sm" as="span">
              {card.title}
            </Text>
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
