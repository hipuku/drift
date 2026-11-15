import type { ReactNode } from "react";
import { Text, type TypeRole } from "../components/Text/Text.js";
import styles from "./Foundation.module.css";

const ACCENT = [
  ["50", "var(--drift-color-accent-50)"],
  ["100", "var(--drift-color-accent-100)"],
  ["200", "var(--drift-color-accent-200)"],
  ["300", "var(--drift-color-accent-300)"],
  ["400", "var(--drift-color-accent-400)"],
  ["500", "var(--drift-color-accent-500)"],
  ["600", "var(--drift-color-accent-600)"],
  ["700", "var(--drift-color-accent-700)"],
  ["800", "var(--drift-color-accent-800)"],
  ["900", "var(--drift-color-accent-900)"],
] as const;
const NEUTRAL = [
  ["0", "var(--drift-color-neutral-0)"],
  ["50", "var(--drift-color-neutral-50)"],
  ["100", "var(--drift-color-neutral-100)"],
  ["200", "var(--drift-color-neutral-200)"],
  ["300", "var(--drift-color-neutral-300)"],
  ["400", "var(--drift-color-neutral-400)"],
  ["500", "var(--drift-color-neutral-500)"],
  ["600", "var(--drift-color-neutral-600)"],
  ["700", "var(--drift-color-neutral-700)"],
  ["800", "var(--drift-color-neutral-800)"],
  ["900", "var(--drift-color-neutral-900)"],
  ["950", "var(--drift-color-neutral-950)"],
] as const;

// Each token is written in full, never assembled from parts, so the token tests can check
// that every one the specimen reads is defined.
const FEEDBACK = [
  {
    key: "info",
    label: "Info",
    subtle: "var(--drift-color-info-subtle)",
    border: "var(--drift-color-info-border)",
    ink: "var(--drift-color-info-on-subtle)",
    dot: "var(--drift-color-info-default)",
  },
  {
    key: "success",
    label: "Success",
    subtle: "var(--drift-color-success-subtle)",
    border: "var(--drift-color-success-border)",
    ink: "var(--drift-color-success-on-subtle)",
    dot: "var(--drift-color-success-default)",
  },
  {
    key: "warning",
    label: "Warning",
    subtle: "var(--drift-color-warning-subtle)",
    border: "var(--drift-color-warning-border)",
    ink: "var(--drift-color-warning-on-subtle)",
    dot: "var(--drift-color-warning-default)",
  },
  {
    key: "error",
    label: "Error",
    subtle: "var(--drift-color-error-subtle)",
    border: "var(--drift-color-error-border)",
    ink: "var(--drift-color-error-on-subtle)",
    dot: "var(--drift-color-error-default)",
  },
] as const;

const SURFACES = [
  {
    label: "default",
    bg: "var(--drift-color-surface-default)",
    ink: "var(--drift-color-ink-primary)",
  },
  {
    label: "subtle",
    bg: "var(--drift-color-surface-subtle)",
    ink: "var(--drift-color-ink-primary)",
  },
  {
    label: "sunken",
    bg: "var(--drift-color-surface-sunken)",
    ink: "var(--drift-color-ink-secondary)",
  },
] as const;

const TYPE: { role: TypeRole; text: string }[] = [
  { role: "display", text: "picocss.com" },
  { role: "heading-lg", text: "Colour" },
  { role: "heading", text: "Clusters and contrast" },
  { role: "heading-sm", text: "Near-duplicates" },
  { role: "body-lg", text: "Drift lists a site's pages and audits the selected ones." },
  {
    role: "body",
    text: "Grouped by CIEDE2000 distance and attributed to the pages they appear on.",
  },
  { role: "body-sm", text: "14 greys in use, 4 of them declared as tokens." },
  { role: "label", text: "Representative" },
  { role: "label-sm", text: "Total usage" },
  { role: "label-xs", text: "WCAG AA" },
  { role: "mono", text: "#001f3f · oklch(58% 0.09 200)" },
];

const SPACE = [
  ["space-1", "var(--drift-space-1)"],
  ["space-2", "var(--drift-space-2)"],
  ["space-3", "var(--drift-space-3)"],
  ["space-4", "var(--drift-space-4)"],
  ["space-5", "var(--drift-space-5)"],
  ["space-6", "var(--drift-space-6)"],
  ["space-8", "var(--drift-space-8)"],
  ["space-10", "var(--drift-space-10)"],
  ["space-12", "var(--drift-space-12)"],
] as const;
const RADII = [
  ["sm", "var(--drift-radius-sm)"],
  ["md", "var(--drift-radius-md)"],
  ["lg", "var(--drift-radius-lg)"],
  ["xl", "var(--drift-radius-xl)"],
  ["full", "var(--drift-radius-full)"],
] as const;
const SHADOWS = [
  ["raised", "var(--drift-elevation-raised)"],
  ["overlay", "var(--drift-elevation-overlay)"],
  ["modal", "var(--drift-elevation-modal)"],
  ["popover", "var(--drift-elevation-popover)"],
] as const;

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

function Ramp({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <div className={styles.ramp}>
      {steps.map(([label, colour]) => (
        <div key={label} className={styles.chipWrap}>
          <div className={styles.chip} style={{ background: colour }} />
          <span className={styles.chipLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Foundation() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Text role="display" as="h1">
          Design foundation
        </Text>
        <Text role="mono" as="p" className={styles.note}>
          drift design foundation · accent 239 · stack sans · text + notch
        </Text>
      </header>

      <Section label="Accent">
        <Ramp steps={ACCENT} />
      </Section>

      <Section label="Neutral">
        <Ramp steps={NEUTRAL} />
      </Section>

      <Section label="Feedback">
        <div className={styles.feedbackRow}>
          {FEEDBACK.map((f) => (
            <div
              key={f.key}
              className={styles.feedbackChip}
              style={{
                background: f.subtle,
                borderColor: f.border,
                color: f.ink,
              }}
            >
              <span className={styles.dot} style={{ background: f.dot }} />
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
              style={{ background: s.bg, color: s.ink }}
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
          {SPACE.map(([label, width]) => (
            <div key={label} className={styles.spaceRow}>
              <span className={styles.rowLabel}>{label}</span>
              <span className={styles.spaceBar} style={{ width }} />
            </div>
          ))}
        </div>
      </Section>

      <Section label="Radius">
        <div className={styles.boxRow}>
          {RADII.map(([label, radius]) => (
            <div key={label} className={styles.box} style={{ borderRadius: radius }}>
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section label="Shadow">
        <div className={styles.boxRow}>
          {SHADOWS.map(([label, shadow]) => (
            <div key={label} className={styles.shadowBox} style={{ boxShadow: shadow }}>
              {label}
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
