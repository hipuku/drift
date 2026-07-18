/**
 * The audit report.
 *
 * Renders the structured report the agent emitted via generate_report: a health
 * score, a plain-English summary, findings sorted worst-first, and the
 * consolidation opportunities. The JSON download is produced client-side from
 * the same object (PDF export is a backend step). Presentation only.
 */

import { Button } from "../../components/Button/Button.js";
import { Text } from "../../components/Text/Text.js";
import type { AuditReport, ReportFinding } from "../../lib/api.js";
import styles from "./Report.module.css";

interface ReportProps {
  report: AuditReport;
  rootUrl?: string;
  onRestart: () => void;
  /** Open the Layer-2 type-scale proposal. Omitted in the dev harness. */
  onProposals?: () => void;
}

const SEVERITY_ORDER: Record<ReportFinding["severity"], number> = { high: 0, medium: 1, low: 2 };

export function Report({ report, rootUrl, onRestart, onProposals }: ReportProps) {
  const findings = [...report.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "drift-audit.json";
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div className={styles.scoreWrap}>
          <Score value={report.healthScore} />
        </div>
        <div className={styles.headText}>
          <Text role="label-xs" as="p" className={styles.eyebrow}>
            Audit report{rootUrl ? ` · ${hostOf(rootUrl)}` : ""}
          </Text>
          <Text role="heading-lg" as="h1">
            Health {report.healthScore}/100
          </Text>
          <Text role="body" as="p" className={styles.summary}>
            {report.summary}
          </Text>
        </div>
      </header>

      <section className={styles.section} aria-label="Findings">
        <Text role="label-xs" as="h2" className={styles.sectionLabel}>
          Findings · {findings.length}
        </Text>
        {findings.length === 0 ? (
          <Text role="body" className={styles.empty}>
            No findings — the system is consistent.
          </Text>
        ) : (
          <ul className={styles.findings}>
            {findings.map((f, i) => (
              <li key={i} className={styles.finding}>
                <div className={styles.findingHead}>
                  <span className={`${styles.badge} ${styles[f.severity]}`}>{f.severity}</span>
                  <Text role="label-sm" className={styles.area}>
                    {f.area}
                  </Text>
                </div>
                <Text role="body" as="p" className={styles.desc}>
                  {f.description}
                </Text>
                <Text role="body-sm" as="p" className={styles.rec}>
                  {f.recommendation}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.consolidationOpportunities.length > 0 && (
        <section className={styles.section} aria-label="Consolidation opportunities">
          <Text role="label-xs" as="h2" className={styles.sectionLabel}>
            Consolidation opportunities
          </Text>
          <ul className={styles.opps}>
            {report.consolidationOpportunities.map((o, i) => (
              <li key={i} className={styles.opp}>
                <Text role="body">{o}</Text>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={downloadJson}>
          Download JSON
        </Button>
        {onProposals && (
          <Button variant="secondary" onClick={onProposals}>
            See type proposal
          </Button>
        )}
        <Button variant="primary" onClick={onRestart}>
          New audit
        </Button>
      </div>
    </main>
  );
}

/** A compact ring gauge. Green at 100, amber mid, red low — via haus feedback. */
function Score({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 80 ? "success" : clamped >= 50 ? "warning" : "error";
  return (
    <div
      className={`${styles.score} ${styles[`score_${tone}`]}`}
      style={{ ["--score" as string]: `${clamped}` }}
    >
      <Text role="heading" as="span">
        {clamped}
      </Text>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
