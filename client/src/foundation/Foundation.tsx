import type { ReactNode } from "react";
import { Text, type TypeRole } from "../components/Text/Text.js";
import styles from "./Foundation.module.css";

const JUNIPER = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const DAMSON = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const FEEDBACK = [
  { key: "info", label: "Info" },
  { key: "success", label: "Success" },
  { key: "warning", label: "Warning" },
  { key: "error", label: "Error" },
] as const;

const SURFACES = [
  { label: "default", bg: "--color-surface-default", ink: "--color-ink-primary" },
  { label: "subtle", bg: "--color-surface-subtle", ink: "--color-ink-primary" },
  { label: "sunken", bg: "--color-surface-sunken", ink: "--color-ink-secondary" },
  { label: "inverse", bg: "--color-surface-inverse", ink: "--color-ink-inverse" },
] as const;

const TYPE: { role: TypeRole; text: string }[] = [
  { role: "display", text: "Design drifts." },
  { role: "heading-lg", text: "Every colour, measured." },
  { role: "heading", text: "Clusters and contrast" },
  { role: "heading-sm", text: "Consolidation opportunities" },
  { role: "body-lg", text: "Paste a URL and Drift audits the visual state of the site." },
  { role: "body", text: "Deduplicated, clustered, and mapped to the pages they appear on." },
  { role: "body-sm", text: "Fourteen greys where the system defines four." },
  { role: "label", text: "Representative" },
  { role: "label-sm", text: "Total usage" },
  { role: "label-xs", text: "WCAG AA" },
  { role: "mono", text: "#001f3f · oklch(58% 0.09 200)" },
];

const SPACE = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const RADII = ["sm", "md", "lg", "xl", "2xl"] as const;
const SHADOWS = ["sm", "md", "lg", "xl"] as const;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <Text role="label-xs" as="h2" className={styles.sectionLabel}>
        {label}
      </Text>
      {children}
    </section>
  );
}

function Ramp({ name, steps }: { name: string; steps: number[] }) {
  return (
    <div className={styles.ramp}>
      {steps.map((n) => (
        <div key={n} className={styles.chipWrap}>
          <div className={styles.chip} style={{ background: `var(--${name}-${n})` }} />
          <span className={styles.chipLabel}>{n}</span>
        </div>
      ))}
    </div>
  );
}

export function Foundation() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Text role="display" as="h1" className={styles.wordmark}>
          drift
        </Text>
        <Text role="heading" as="p" className={styles.subtitle}>
          Design foundation
        </Text>
        <Text role="mono" as="p" className={styles.note}>
          consuming <strong>haus</strong> · juniper accent · stack sans · text + notch
        </Text>
      </header>

      <Section label="Accent · Juniper">
        <Ramp name="juniper" steps={JUNIPER} />
      </Section>

      <Section label="Neutral · Damson">
        <Ramp name="damson" steps={DAMSON} />
      </Section>

      <Section label="Feedback">
        <div className={styles.feedbackRow}>
          {FEEDBACK.map((f) => (
            <div
              key={f.key}
              className={styles.feedbackChip}
              style={{
                background: `var(--color-${f.key}-subtle)`,
                borderColor: `var(--color-${f.key}-border)`,
                color: `var(--color-${f.key}-on-subtle)`,
              }}
            >
              <span className={styles.dot} style={{ background: `var(--color-${f.key}-default)` }} />
              {f.label}
            </div>
          ))}
        </div>
      </Section>

      <Section label="Surfaces">
        <div className={styles.surfaceRow}>
          {SURFACES.map((s) => (
            <div
              key={s.label}
              className={styles.surfaceCell}
              style={{ background: `var(${s.bg})`, color: `var(${s.ink})` }}
            >
              <span className={styles.surfaceName}>{s.label}</span>
              <Text role="heading-lg" as="span">
                Ag
              </Text>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Type">
        <div className={styles.typeList}>
          {TYPE.map((t) => (
            <div key={t.role} className={styles.typeRow}>
              <span className={styles.rowLabel}>{t.role}</span>
              <Text role={t.role}>{t.text}</Text>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Space">
        <div className={styles.spaceList}>
          {SPACE.map((n) => (
            <div key={n} className={styles.spaceRow}>
              <span className={styles.rowLabel}>space-{n}</span>
              <span className={styles.spaceBar} style={{ width: `var(--space-${n})` }} />
            </div>
          ))}
        </div>
      </Section>

      <Section label="Radius">
        <div className={styles.boxRow}>
          {RADII.map((r) => (
            <div key={r} className={styles.box} style={{ borderRadius: `var(--radius-${r})` }}>
              {r}
            </div>
          ))}
        </div>
      </Section>

      <Section label="Shadow">
        <div className={styles.boxRow}>
          {SHADOWS.map((s) => (
            <div key={s} className={styles.shadowBox} style={{ boxShadow: `var(--shadow-${s})` }}>
              {s}
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
