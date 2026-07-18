import { useState } from "react";
import { Button } from "../../components/Button/Button.js";
import { Callout } from "../../components/Callout/Callout.js";
import { Text } from "../../components/Text/Text.js";
import { TextField } from "../../components/TextField/TextField.js";
import styles from "./Configure.module.css";

const VISIBLE = 8;
/** Mirrors the backend's MAX_CRAWL_PAGES ceiling. */
const CRAWL_CEILING = 40;

interface DiscoveredPage {
  url: string;
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

interface ConfigureProps {
  /** Hand the resolved URL and the chosen page URLs to the orchestrator. */
  onSubmit?: (url: string, pages: string[]) => void;
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

export function Configure({ onSubmit }: ConfigureProps = {}) {
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [resolvedHost, setResolvedHost] = useState("");
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Before discovery we only know the typed host; after, the server's resolved
  // one (which may have gained www / a scheme).
  const host = resolvedHost || hostOf(url);

  const discover = async () => {
    setStep("discovering");
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Discovery failed (${res.status})`);
      }
      const data = (await res.json()) as { pages: DiscoveredPage[]; rootUrl?: string; host?: string };
      setPages(data.pages);
      setResolvedUrl(data.rootUrl ?? url.trim());
      setResolvedHost(data.host ?? "");
      // Default to the homepage — the single most representative page.
      setSelected(new Set(data.pages[0] ? [data.pages[0].path] : []));
      setShowAll(false);
      setQuery("");
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
      // Gate selection at the crawl ceiling so nothing is silently dropped later.
      else if (next.size < CRAWL_CEILING) next.add(path);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set(pages.slice(0, CRAWL_CEILING).map((p) => p.path)));
  const clear = () => setSelected(new Set());

  const atLimit = selected.size >= CRAWL_CEILING;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? pages.filter((p) => `${p.title} ${p.path}`.toLowerCase().includes(q))
    : pages;
  // While searching, show every match; otherwise cap until "Show more".
  const visiblePages = q || showAll ? filtered : filtered.slice(0, VISIBLE);
  const hidden = filtered.length - visiblePages.length;
  const allSelected = selected.size >= Math.min(pages.length, CRAWL_CEILING);
  const overCeiling = pages.length > CRAWL_CEILING;
  const showSearch = pages.length > VISIBLE;

  const submit = () => {
    const chosen = pages.filter((p) => selected.has(p.path)).map((p) => p.url);
    onSubmit?.(resolvedUrl || url.trim(), chosen);
  };

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
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="studiooptics.com.au"
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
              <strong className={styles.count}>{pages.length} pages found</strong> — audit one, a
              few, or the whole site. The design language lives in the shared stylesheet, so a
              handful captures most of it.
            </Text>

            {showSearch && (
              <input
                type="text"
                className={styles.search}
                placeholder="Search pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Search pages"
              />
            )}

            <div className={styles.listActions}>
              <button
                type="button"
                className={styles.textAction}
                onClick={selectAll}
                disabled={allSelected}
              >
                Select all{overCeiling ? ` (first ${CRAWL_CEILING})` : ""}
              </button>
              <span className={styles.actionDivider} aria-hidden="true" />
              <button
                type="button"
                className={styles.textAction}
                onClick={clear}
                disabled={selected.size === 0}
              >
                Clear
              </button>
            </div>

            <div className={styles.list} role="group" aria-label="Pages to audit">
              {visiblePages.length === 0 && (
                <div className={styles.empty}>
                  <Text role="body-sm" className={styles.muted}>
                    No pages match “{query}”.
                  </Text>
                </div>
              )}
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
                {selected.size} selected
                {atLimit && <span className={styles.limitNote}> · {CRAWL_CEILING} max</span>}
              </Text>
              <Button variant="primary" fullWidth disabled={selected.size === 0} onClick={submit}>
                Run audit · {selected.size} page{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
