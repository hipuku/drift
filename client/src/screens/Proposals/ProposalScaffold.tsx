/**
 * Shared chrome for the token proposals — the page frame, header (back + title +
 * evidence intro), an optional controls slot, the Current/Proposed toggle, and
 * the export panel at the foot. Each proposal supplies its own body (the ladder
 * of rows) as children, because the row visuals differ per token; everything
 * around the body is identical, so it lives here once.
 */

import type { ReactNode } from "react";
import { Text } from "../../components/Text/Text.js";
import styles from "./ProposalScaffold.module.css";

interface Props {
  onBack?: () => void;
  title: string;
  intro: ReactNode;
  /** Optional controls rendered above the toggle (e.g. a base-unit picker). */
  controls?: ReactNode;
  applied: boolean;
  onAppliedChange: (applied: boolean) => void;
  /** Toggle labels — default Current / Proposed; Type uses "Regularised". */
  currentLabel?: string;
  proposedLabel?: string;
  hint: ReactNode;
  /** The proposal body — typically a ladder of rows. */
  children: ReactNode;
  /** The export panel element, rendered at the foot. */
  exportPanel: ReactNode;
}

export function ProposalScaffold({
  onBack,
  title,
  intro,
  controls,
  applied,
  onAppliedChange,
  currentLabel = "Current",
  proposedLabel = "Proposed",
  hint,
  children,
  exportPanel,
}: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to proposals
          </button>
        )}
        <Text role="heading-lg" as="h1">
          {title}
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          {intro}
        </Text>
      </header>

      {controls && <div className={styles.controls}>{controls}</div>}

      <div className={controls ? `${styles.applyRow} ${styles.applyRowTight}` : styles.applyRow}>
        <div className={styles.toggle} role="tablist" aria-label="Preview">
          <button
            type="button"
            role="tab"
            aria-selected={!applied}
            className={!applied ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => onAppliedChange(false)}
          >
            {currentLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={applied}
            className={applied ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => onAppliedChange(true)}
          >
            {proposedLabel}
          </button>
        </div>
        <Text role="label-sm" className={styles.applyHint}>
          {hint}
        </Text>
      </div>

      {children}

      {exportPanel}
    </main>
  );
}
