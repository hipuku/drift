/**
 * The audit flow orchestrator.
 *
 *   configure → crawling → audit (the inventory)
 *                    │          │
 *                    └──────────┴───────────────────────────────────────→ error
 *
 * Crawl completion (WebSocket + poll) triggers the audit fetch. The audit is
 * the destination — the honest "what the site actually ships", closed by the
 * token export.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAudit,
  startCrawl,
  type SiteAudit,
} from "../lib/api.js";
import { useCrawlProgress } from "../lib/useCrawlProgress.js";
import { Audit } from "../screens/Audit/Audit.js";
import { Configure } from "../screens/Configure/Configure.js";
import { Crawling } from "../screens/Crawling/Crawling.js";
import { Failed, Thinking } from "../screens/Status/Status.js";

type Phase = "configure" | "crawling" | "loading" | "audit" | "error";

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

export function AuditFlow() {
  const [phase, setPhase] = useState<Phase>("configure");
  const [jobId, setJobId] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [audit, setAudit] = useState<SiteAudit | null>(null);
  const [error, setError] = useState<string>("");

  const crawl = useCrawlProgress(phase === "crawling" ? jobId : null);
  const loadedRef = useRef(false);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  // Forward navigation pushes a history entry so the browser Back button walks
  // the flow instead of leaving the app. popstate is the single place that
  // reacts to a pop.
  const go = useCallback((next: Phase) => {
    setPhase(next);
    window.history.pushState({ phase: next }, "");
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { phase?: Phase } | null;
      setPhase(state?.phase ?? "configure");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // On crawl completion, fetch the audit and land on it.
  const loadAudit = useCallback(
    async (id: string) => {
      setPhase("loading");
      try {
        setAudit(await getAudit(id));
        go("audit");
      } catch (err) {
        fail(err instanceof Error ? err.message : "Could not read the design system.");
      }
    },
    [fail, go],
  );

  // Orchestration: advance the flow when the crawl job reaches a terminal
  // state. The job is an external system, so reacting to it in an effect is
  // the intended use — the rule fires only because the transition happens to
  // be expressed as setState. There is nothing to derive here; the flow moves
  // once, guarded by loadedRef.
  /* eslint-disable react-hooks/set-state-in-effect -- see the note above */
  useEffect(() => {
    if (phase !== "crawling" || !jobId) return;
    if (crawl.phase === "completed" && !loadedRef.current) {
      loadedRef.current = true;
      if (crawl.result && crawl.result.pages.length === 0) {
        fail("Couldn't read any pages — the site may be slow to load or blocking automated visits. Try again, or pick fewer pages.");
      } else {
        void loadAudit(jobId);
      }
    } else if (crawl.phase === "failed") {
      fail(crawl.error ?? "The crawl failed.");
    }
  }, [phase, jobId, crawl.phase, crawl.error, loadAudit, fail]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleConfigure = useCallback(
    async (url: string, pages: string[]) => {
      loadedRef.current = false;
      setHost(hostOf(url));
      try {
        const { jobId: id } = await startCrawl(url, pages);
        setJobId(id);
        setPhase("crawling");
      } catch (err) {
        fail(err instanceof Error ? err.message : "Could not start the crawl.");
      }
    },
    [fail],
  );

  const reset = useCallback(() => {
    loadedRef.current = false;
    setPhase("configure");
    setJobId(null);
    setHost("");
    setAudit(null);
    setError("");
  }, []);

  switch (phase) {
    case "configure":
      return <Configure onSubmit={handleConfigure} />;
    case "crawling":
      return <Crawling host={host} progress={crawl.progress} pages={crawl.crawledPages} />;
    case "loading":
      return (
        <Thinking
          title="Reading the design system"
          detail="Aggregating every colour, size, and spacing value in use across the crawled pages."
        />
      );
    case "audit":
      return audit ? <Audit audit={audit} onBack={reset} /> : null;
    case "error":
      return <Failed message={error} onRetry={reset} />;
  }
}
