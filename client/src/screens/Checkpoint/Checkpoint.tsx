/**
 * Human checkpoint.
 *
 * The agent paused because it could not confidently tell intentional variants
 * from accidental drift. It hands us a framing question and the ambiguous
 * items; we collect one decision per item and resume the run. The submit stays
 * disabled until every item is resolved — the agent expects a judgment for each.
 */

import { useState } from "react";
import { Button } from "../../components/Button/Button.js";
import { Text } from "../../components/Text/Text.js";
import type { Judgment, JudgmentDecision, ReviewItem } from "../../lib/api.js";
import styles from "./Checkpoint.module.css";

interface CheckpointProps {
  question: string;
  items: ReviewItem[];
  submitting: boolean;
  onResolve: (judgments: Judgment[]) => void;
}

const CHOICES: { value: JudgmentDecision; label: string; hint: string }[] = [
  { value: "intentional_variant", label: "Intentional", hint: "A deliberate variant — leave it." },
  { value: "consolidation_target", label: "Consolidate", hint: "Accidental drift — merge it." },
];

export function Checkpoint({ question, items, submitting, onResolve }: CheckpointProps) {
  const [decisions, setDecisions] = useState<Record<string, JudgmentDecision>>({});

  const resolvedCount = items.filter((it) => decisions[it.id]).length;
  const allResolved = resolvedCount === items.length;

  const submit = () => {
    if (!allResolved || submitting) return;
    onResolve(items.map((it) => ({ id: it.id, decision: decisions[it.id]! })));
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <Text role="label-xs" as="p" className={styles.eyebrow}>
          Your judgment needed
        </Text>
        <Text role="heading-lg" as="h1">
          {question}
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          The audit paused on {items.length} ambiguous finding{items.length === 1 ? "" : "s"}.
          Resolve each to let it continue.
        </Text>

        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <Text role="body" as="p" className={styles.summary}>
                {item.summary}
              </Text>
              <div
                className={styles.choices}
                role="radiogroup"
                aria-label={`Decision for ${item.summary}`}
              >
                {CHOICES.map((choice) => {
                  const active = decisions[item.id] === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? `${styles.choice} ${styles.choiceOn}` : styles.choice}
                      disabled={submitting}
                      onClick={() =>
                        setDecisions((prev) => ({ ...prev, [item.id]: choice.value }))
                      }
                    >
                      <Text role="label">{choice.label}</Text>
                      <Text role="body-sm" className={styles.hint}>
                        {choice.hint}
                      </Text>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <Text role="label-sm" className={styles.counter}>
            {resolvedCount} of {items.length} resolved
          </Text>
          <Button variant="primary" fullWidth disabled={!allResolved || submitting} onClick={submit}>
            {submitting ? "Resuming…" : "Resume audit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
