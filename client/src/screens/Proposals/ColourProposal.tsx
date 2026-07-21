/**
 * Colour proposal (Layer 2, "what it could be") — consolidation.
 *
 * Shows the site's colours grouped into perceptual clusters: a representative
 * per cluster plus the near-identical members folded into it. The proposal is
 * the consolidation itself — N distinct colours down to M tokens — and the
 * export is the clean palette of representatives. Deterministic.
 */

import { useState } from "react";
import { Text } from "../../components/Text/Text.js";
import type { ColourInventory } from "../../lib/api.js";
import { exportPalette, type ExportFormat } from "../../lib/palette.js";
import styles from "./ColourProposal.module.css";

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "dtcg", label: "DTCG" },
];

interface Props {
  inventory: ColourInventory;
  onBack?: () => void;
}

export function ColourProposal({ inventory, onBack }: Props) {
  const [format, setFormat] = useState<ExportFormat>("css");
  const [copied, setCopied] = useState(false);

  const representatives = inventory.clusters.map((c) => c.representative);
  const exportText = exportPalette(representatives, format);
  const reducible = inventory.distinctColours - inventory.clusterCount;

  const copy = () => {
    void navigator.clipboard?.writeText(exportText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            ← Back to proposals
          </button>
        )}
        <Text role="heading-lg" as="h1">
          What your colour set could be
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          <strong>{inventory.distinctColours}</strong> distinct colours group into{" "}
          <strong>{inventory.clusterCount}</strong> perceptual cluster
          {inventory.clusterCount === 1 ? "" : "s"}
          {reducible > 0 ? <> — {reducible} are near-duplicates you could consolidate.</> : "."}
        </Text>
      </header>

      <div className={styles.clusters}>
        {inventory.clusters.map((c) => (
          <div key={c.representative} className={styles.cluster}>
            <div className={styles.swatch} style={{ background: c.representative }} aria-hidden="true" />
            <div className={styles.body}>
              <div className={styles.rowTop}>
                <Text role="mono" className={styles.hex}>
                  {c.representative}
                </Text>
                {c.size > 1 && <span className={styles.consolidate}>consolidate {c.size} → 1</span>}
              </div>
              <Text role="label-sm" className={styles.usage}>
                used {c.totalUsage}× · {c.pages.length} page{c.pages.length === 1 ? "" : "s"}
              </Text>
              {c.size > 1 && (
                <div className={styles.members}>
                  {c.members.map((m) => (
                    <span
                      key={m}
                      className={styles.chip}
                      style={{ background: m }}
                      title={m}
                      aria-label={m}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className={styles.export} aria-label="Export">
        <div className={styles.exportHead}>
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
        <pre className={styles.code}>{exportText}</pre>
      </section>
    </main>
  );
}
