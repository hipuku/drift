import { useState } from "react";
import { Button } from "../../components/Button/Button.js";
import { Callout } from "../../components/Callout/Callout.js";
import { Text } from "../../components/Text/Text.js";
import { TextField } from "../../components/TextField/TextField.js";
import styles from "./Configure.module.css";

const MAX_PAGES = 5;
const VISIBLE = 6;

interface DiscoveredPage {
  path: string;
  title: string;
}

type Step = "url" | "discovering" | "select";

function hostOf(raw: string): string {
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      return new URL(candidate).host;
    } catch {
      // try next
    }
  }
  return raw || "the site";
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.4l2.4 2.4 4.6-5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Configure() {
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = hostOf(url);

  const discover = async () => {
    setStep("discovering");
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Discovery failed (${res.status})`);
      }
      const data = (await res.json()) as { pages: DiscoveredPage[] };
      setPages(data.pages);
      setSelected(new Set(data.pages[0] ? [data.pages[0].path] : []));
      setShowAll(false);
      setStep("select");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the site.");
      setStep("url");
    }
  };

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else if (next.size < MAX_PAGES) next.add(path);
      return next;
    });
  };

  const atLimit = selected.size >= MAX_PAGES;
  const visiblePages = showAll ? pages : pages.slice(0, VISIBLE);
  const hidden = pages.length - visiblePages.length;

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        {step === "url" && (
          <>
            <Text role="heading-lg" as="h1">
              Diagnose a site
            </Text>
            <Text role="body" as="p" className={styles.intro}>
              Paste a URL. Drift finds the site’s pages and lets you pick which ones to audit —
              then reports where the design system has drifted.
            </Text>
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim() !== "") discover();
              }}
            >
              <TextField
                id="url"
                label="URL"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button variant="primary" fullWidth type="submit" disabled={url.trim() === ""}>
                Find pages
              </Button>
              {error && <Callout variant="error">{error}</Callout>}
            </form>
          </>
        )}

        {step === "discovering" && (
          <>
            <Text role="heading-lg" as="h1">
              Finding pages
            </Text>
            <div className={styles.discovering}>
              <span className={styles.spinner} aria-hidden="true" />
              <Text role="body">Reading {host}…</Text>
            </div>
          </>
        )}

        {step === "select" && (
          <>
            <button type="button" className={styles.back} onClick={() => setStep("url")}>
              <span aria-hidden="true">←</span> {host}
            </button>
            <Text role="heading-lg" as="h1">
              Pick pages to audit
            </Text>
            <Text role="body" as="p" className={styles.intro}>
              <strong className={styles.count}>{pages.length} pages found</strong> — choose up to{" "}
              {MAX_PAGES}. A handful is enough to capture the design language.
            </Text>

            <div className={styles.list} role="group" aria-label="Pages to audit">
              {visiblePages.map((page) => {
                const isOn = selected.has(page.path);
                const disabled = !isOn && atLimit;
                return (
                  <button
                    key={page.path}
                    type="button"
                    className={[styles.row, isOn ? styles.rowSelected : "", disabled ? styles.rowDisabled : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={isOn}
                    disabled={disabled}
                    onClick={() => toggle(page.path)}
                  >
                    <span className={isOn ? `${styles.check} ${styles.checkOn}` : styles.check}>
                      {isOn && <Check />}
                    </span>
                    <span className={styles.rowText}>
                      <Text role="body">{page.title}</Text>
                      <Text role="mono" className={styles.path}>
                        {page.path}
                      </Text>
                    </span>
                  </button>
                );
              })}
            </div>

            {hidden > 0 && (
              <button type="button" className={styles.showMore} onClick={() => setShowAll(true)}>
                Show {hidden} more
              </button>
            )}

            <div className={styles.footer}>
              <Text role="label-sm" className={styles.counter}>
                {selected.size} of {MAX_PAGES} selected
              </Text>
              <Button variant="primary" fullWidth disabled={selected.size === 0}>
                Run audit · {selected.size} page{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
