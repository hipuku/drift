import { useState } from "react";
import { Button } from "../../components/Button/Button.js";
import { Callout } from "../../components/Callout/Callout.js";
import { Text } from "../../components/Text/Text.js";
import { TextField } from "../../components/TextField/TextField.js";
import { useDiscovery } from "../../hooks/useDiscovery.js";
import { DEMO_CAPTURED, DEMO_MODE, DEMO_SITE } from "../../demo/index.js";
import styles from "./Configure.module.css";

const VISIBLE = 10;
/** Mirrors the backend's MAX_CRAWL_PAGES ceiling (how many pages one audit visits). */
const CRAWL_CEILING = 10;

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
  const { status, error, pages, rootUrl: resolvedUrl, host: resolvedHost, discover: runDiscovery, addPage: addDiscoveredPage, reset } =
    useDiscovery();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Before discovery we only know the typed host; after, the server's resolved
  // one (which may have gained www / a scheme).
  const host = resolvedHost || hostOf(url);

  const discover = async () => {
    const found = await runDiscovery(url);
    if (!found) return;
    // The selection is this screen's concern, not the hook's. Default to the
    // homepage, the single most representative page.
    setSelected(new Set(found[0] ? [found[0].path] : []));
    setShowAll(false);
    setQuery("");
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

  // Add a page discovery missed (deep, unlinked, or not in the sitemap). Accepts
  // only a path or slug ("/about", "pricing"); the origin is already fixed by
  // the site URL above, so a full URL or domain is rejected as ambiguous.
  const addPage = () => {
    const raw = addUrl.trim();
    if (!raw) return;
    let origin: string;
    try {
      origin = new URL(resolvedUrl || `https://${host}`).origin;
    } catch {
      setAddError("Enter a URL for the site first.");
      return;
    }
    // Reject anything that carries its own origin: scheme, protocol-relative,
    // or a leading domain segment ("example.com/about").
    const firstSeg = raw.replace(/^\//, "").split(/[/?#]/)[0] ?? "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("//") || firstSeg.includes(".")) {
      setAddError("Enter just the path, like /pricing, without the origin.");
      return;
    }
    let full: URL;
    try {
      full = new URL(raw.startsWith("/") ? raw : `/${raw}`, origin);
    } catch {
      setAddError("That doesn’t look like a valid page.");
      return;
    }
    const path = `${full.pathname}${full.search}` || "/";
    setAddError(null);
    setAddUrl("");
    setQuery("");
    setShowAll(true);
    if (!pages.some((p) => p.path === path)) {
      addDiscoveredPage({ url: full.href, path, title: path });
    }
    setSelected((prev) => {
      if (prev.has(path) || prev.size >= CRAWL_CEILING) return prev;
      return new Set(prev).add(path);
    });
  };

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
        {status === "idle" && (
          <>
            <Text role="heading-lg" as="h1">
              Diagnose a site
            </Text>
            {DEMO_MODE && (
              <div className={styles.demoNote}>
                <strong>Demo.</strong> The crawler is a headless browser behind a
                job queue, so it isn&rsquo;t left running on a public URL. This
                build replays a real audit of <strong>{DEMO_SITE}</strong>{" "}
                captured in {DEMO_CAPTURED}. The inventory, verdicts and export
                are the genuine output. Run it locally to audit any site.
              </div>
            )}
            <Text role="body" as="p" className={styles.intro}>
              Paste a URL. Drift finds the site’s pages, lets you pick which ones to audit, and
              reports where the design system has drifted.
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
                placeholder="picocss.com"
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

        {status === "discovering" && (
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

        {status === "ready" && (
          <>
            <button type="button" className={styles.back} onClick={reset}>
              <span aria-hidden="true">←</span> {host}
            </button>
            <Text role="heading-lg" as="h1">
              Pick pages to audit
            </Text>
            <Text role="body" as="p" className={styles.intro}>
              <strong className={styles.count}>{pages.length} pages found</strong>. Audit one, a
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

            <form
              className={styles.addRow}
              onSubmit={(e) => {
                e.preventDefault();
                addPage();
              }}
            >
              <input
                type="text"
                className={styles.addInput}
                placeholder="Not listed? Add a page by /path…"
                value={addUrl}
                onChange={(e) => {
                  setAddUrl(e.target.value);
                  setAddError(null);
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Add a page by path"
              />
              <button
                type="submit"
                className={styles.textAction}
                disabled={addUrl.trim() === "" || atLimit}
              >
                Add
              </button>
            </form>
            {addError && (
              <Text role="body-sm" className={styles.muted}>
                {addError}
              </Text>
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
