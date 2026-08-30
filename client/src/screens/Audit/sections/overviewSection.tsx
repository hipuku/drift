/**
 * The overview: the diagnosis, before any of the inventory.
 *
 * A reader who opens an audit wants to know whether anything is wrong, not to
 * read twelve tables and work it out. So this leads with a sentence and a grid
 * of verdict cards tinted by severity — the colour is the finding — and each
 * card is a link into the tab that evidences it.
 *
 * The verdicts are built by the screen rather than here, because the export
 * ships the same list: one place decides what the verdicts are, and this
 * decides how they read.
 */

import { faChevronDown, faChevronUp, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { Callout } from "../../../components/Callout/Callout.js";
import { Text } from "../../../components/Text/Text.js";
import type { AuditAuthored } from "../../../lib/api.js";
import {
  CATEGORY_LABEL,
  VERDICT_TAB,
  colourish,
  plural,
  unitLabel,
  type Verdict,
} from "../auditModel.js";
import styles from "../Audit.module.css";

export interface VerdictCard {
  label: string;
  n: number;
  chips: string[];
  verdict: Verdict;
}

export function OverviewSection({
  health,
  verdicts,
  authored,
  tabIcon,
  hasTab,
  onGoToTab,
}: {
  health: string;
  verdicts: VerdictCard[];
  authored?: AuditAuthored;
  tabIcon: Record<string, IconDefinition>;
  hasTab: (id: string) => boolean;
  onGoToTab: (id: string) => void;
}) {
  return (
    <>
        <div className={styles.health}>
          <Text role="label-sm" className={styles.healthKicker}>
            Design Health
          </Text>
          <Text role="heading-lg" as="p" className={styles.healthLine}>
            {health}
          </Text>
        </div>
        <div className={styles.verdictGrid}>
          {verdicts.map((v) => {
            const id = VERDICT_TAB[v.label];
            const linked = id != null && hasTab(id);
            const className = `${styles.verdict} ${styles[v.verdict] ?? ""}${
              linked ? ` ${styles.verdictClickable}` : ""
            }`;
            const icon = id ? tabIcon[id] : undefined;
            const body = (
              <>
                <span className={styles.verdictLabelRow}>
                  {icon && (
                    <FontAwesomeIcon icon={icon} className={styles.verdictIcon} aria-hidden="true" />
                  )}
                  <Text role="label" className={styles.verdictLabel}>
                    {v.label}
                  </Text>
                </span>
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
            return linked ? (
              <button key={v.label} type="button" className={className} onClick={() => onGoToTab(id)}>
                {body}
              </button>
            ) : (
              <div key={v.label} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      {authored && <AuthoringSummary authored={authored} />}
    </>
  );
}

/**
 * How the site authors its tokens — read from the CSSOM, so it reflects intent
 * (`rem`, `%`, `clamp()`), not the resolved px the rest of the audit shows. The
 * accessibility flag fires when font-size is authored in px (won't respect zoom).
 * The declared custom properties are the site's own tokens, listed as shipped.
 */
function AuthoringSummary({ authored }: { authored: AuditAuthored }) {
  const [open, setOpen] = useState(false);
  const props = authored.customProperties;
  const hasContent = authored.categories.length > 0 || props.length > 0;
  if (!hasContent) return null;
  return (
    <div className={styles.authoring}>
      <Text role="label-sm" className={styles.healthKicker}>
        Authoring
      </Text>
      {authored.categories.length > 0 && (
        <div className={styles.unitRow}>
          {authored.categories.map((c) => (
            <span key={c.category} className={styles.unitChip}>
              <span className={styles.unitCat}>{CATEGORY_LABEL[c.category]}</span>
              <span className={styles.unitVal}>{c.dominant ? unitLabel(c.dominant) : "—"}</span>
            </span>
          ))}
        </div>
      )}
      {authored.typeInPx && (
        <Callout variant="warning">
          Font size is authored in <strong>px</strong> — it won&rsquo;t scale with the reader&rsquo;s
          browser font size or zoom. Prefer <strong>rem</strong>.
        </Callout>
      )}
      {props.length > 0 && (
        <div className={styles.authoredProps}>
          <button
            type="button"
            className={styles.authoredToggle}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span>
              Declares <strong>{props.length}</strong> CSS custom{" "}
              {plural(props.length, "property", "properties")} — the site&rsquo;s own tokens
            </span>
            <FontAwesomeIcon
              icon={open ? faChevronUp : faChevronDown}
              className={styles.authoredCaret}
            />
          </button>
          {open && (
            <ul className={styles.propList}>
              {props.map((p) => (
                <li key={p.name} className={styles.propRow}>
                  {colourish(p.value) && (
                    <span className={styles.propSwatch} style={{ background: p.value }} aria-hidden="true" />
                  )}
                  <code className={styles.propName}>{p.name}</code>
                  <span className={styles.propValue} title={p.value}>
                    {p.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
