/**
 * Shared export chrome for proposals — a format tablist, a Copy button, and the
 * generated code block. Every proposal emits the same three formats; this keeps
 * the interaction and markup identical across colour, type, spacing, and the
 * token proposals still to come. The caller owns the format→text mapping.
 */

import { useState } from "react";

export type ExportFormat = "css" | "tailwind" | "dtcg";

import styles from "./ExportPanel.module.css";

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "dtcg", label: "DTCG" },
];

interface Props {
  /** Returns the export text for a given format. */
  render: (format: ExportFormat) => string;
}

export function ExportPanel({ render }: Props) {
  const [format, setFormat] = useState<ExportFormat>("css");
  const [copied, setCopied] = useState(false);

  const text = render(format);

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className={styles.export} aria-label="Export">
      <div className={styles.head}>
        <div className={styles.formats} role="tablist" aria-label="Export format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={format === f.id}
              className={format === f.id ? `${styles.fmt} ${styles.fmtOn}` : styles.fmt}
              onClick={() => setFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.copy} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={styles.code}>{text}</pre>
    </section>
  );
}
