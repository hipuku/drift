/**
 * Proposals hub — the entry to Layer 2 ("what it could be").
 *
 * Not a flat menu: each token carries its drift signal from the audit (near-
 * duplicate colours, off-scale sizes, off-grid spacing) and the cards sort
 * worst-first, so the hub reads as "here's where your system is drifting most,
 * start there". New token proposals plug in by contributing a signal. Extensible.
 */

import { Text } from "../../components/Text/Text.js";
import { Badge } from "../../components/Badge/Badge.js";
import type { SiteAudit } from "../../lib/api.js";
import { buildElevationLadder } from "../../lib/shadowScale.js";
import { assignLayers } from "../../lib/zIndexScale.js";
import styles from "./ProposalsHub.module.css";

export type ProposalKind = "type" | "colour" | "spacing" | "radius" | "shadow" | "zindex";

interface Props {
  onSelect: (kind: ProposalKind) => void;
  onBack?: () => void;
  /** The full audit, for per-token drift signals. Omitted in some harness views. */
  audit?: SiteAudit;
}

interface CardMeta {
  kind: ProposalKind;
  title: string;
  blurb: string;
  /** The drift count for this token, from the audit. */
  count: (a: SiteAudit) => number;
  /** Singular and plural forms of the signal — grammar differs per phrase. */
  noun: [singular: string, plural: string];
}

const META: CardMeta[] = [
  {
    kind: "colour",
    title: "Colour",
    blurb: "Consolidate near-identical colours to one token each.",
    count: (a) => a.summary.colourNearDuplicates ?? 0,
    noun: ["near-duplicate", "near-duplicates"],
  },
  {
    kind: "type",
    title: "Type scale",
    blurb: "Project your base size onto a modular scale, in your font.",
    count: (a) => a.summary.typeOffScale ?? 0,
    noun: ["size off-scale", "sizes off-scale"],
  },
  {
    kind: "spacing",
    title: "Spacing",
    blurb: "Snap ad-hoc spacing to a clean base grid.",
    count: (a) => a.summary.spacingOffGrid ?? 0,
    noun: ["value off-grid", "values off-grid"],
  },
  {
    kind: "radius",
    title: "Radius",
    blurb: "Fit corner radii to a canonical named ramp.",
    count: (a) => a.summary.radiusNearDuplicates ?? 0,
    noun: ["near-duplicate", "near-duplicates"],
  },
  {
    kind: "shadow",
    title: "Shadow",
    blurb: "Order ad-hoc shadows into a named elevation ladder.",
    // Drift = shadows that fold into a level they don't head.
    count: (a) => Math.max(0, a.shadow.length - buildElevationLadder(a.shadow).length),
    noun: ["shadow to merge", "shadows to merge"],
  },
  {
    kind: "zindex",
    title: "Layering",
    blurb: "Map arbitrary z-index values to a named ladder.",
    // Drift = stacking values inflated far past their ordinal position.
    count: (a) => assignLayers((a.zIndex ?? []).map((z) => z.value)).filter((l) => l.current > l.layer.value * 4).length,
    noun: ["inflated value", "inflated values"],
  },
];

export function ProposalsHub({ onSelect, onBack, audit }: Props) {
  // Keep the audit's token order — the hub should read the same way the report does.
  const cards = META.map((m) => {
    const count = audit ? m.count(audit) : 0;
    return { ...m, count, label: `${count} ${m.noun[count === 1 ? 0 : 1]}` };
  });

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
          Your tokens, projected onto known-good structures. Preview, apply, and export.
        </Text>
      </header>

      <div className={styles.cards}>
        {cards.map((card) => (
          <button key={card.kind} type="button" className={styles.card} onClick={() => onSelect(card.kind)}>
            <div className={styles.cardHead}>
              <Text role="heading-sm" as="span">
                {card.title}
              </Text>
              {audit &&
                (card.count > 0 ? (
                  <Badge variant="warning">{card.label}</Badge>
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
