/**
 * The audit flow orchestrator (deterministic path).
 *
 *   configure → crawling → audit (diagnosis) → proposals → (type | colour)
 *                    │          │
 *                    └──────────┴──────────────────────────────────────→ error
 *
 * Crawl completion (WebSocket + poll) triggers the deterministic audit fetch.
 * The audit is the landing — the honest "what it is". Proposals are opened from
 * it on demand.
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
import { ColourProposal } from "../screens/Proposals/ColourProposal.js";
import { ProposalsHub, type ProposalKind } from "../screens/Proposals/ProposalsHub.js";
import { RadiusProposal } from "../screens/Proposals/RadiusProposal.js";
import { ShadowProposal } from "../screens/Proposals/ShadowProposal.js";
import { SpacingProposal } from "../screens/Proposals/SpacingProposal.js";
import { ZIndexProposal } from "../screens/Proposals/ZIndexProposal.js";
import { TypeScaleProposal } from "../screens/Proposals/TypeScaleProposal.js";
import { Failed, Thinking } from "../screens/Status/Status.js";

type Phase =
  | "configure"
  | "crawling"
  | "loading"
  | "audit"
  | "proposals"
  | "proposals-type"
  | "proposals-colour"
  | "proposals-spacing"
  | "proposals-radius"
  | "proposals-shadow"
  | "proposals-zindex"
  | "error";

const PROPOSAL_PHASE: Record<ProposalKind, Phase> = {
  type: "proposals-type",
  colour: "proposals-colour",
  spacing: "proposals-spacing",
  radius: "proposals-radius",
  shadow: "proposals-shadow",
  zindex: "proposals-zindex",
};

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
  // the flow (proposal → hub → audit) instead of leaving the app. Back buttons
  // call history.back(); popstate is the single place that reacts to a pop.
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

  // On crawl completion, fetch the deterministic audit and land on it.
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

  // Opened from the audit. Every proposal derives from the audit itself, so
  // there's nothing further to fetch.
  const openProposals = useCallback(() => go("proposals"), [go]);

  const back = useCallback(() => window.history.back(), []);

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
      return audit ? <Audit audit={audit} onProposals={openProposals} onBack={reset} /> : null;
    case "proposals":
      return (
        <ProposalsHub
          onSelect={(kind) => go(PROPOSAL_PHASE[kind])}
          onBack={back}
          audit={audit ?? undefined}
        />
      );
    case "proposals-type":
      return audit ? <TypeScaleProposal typography={audit.typography} onBack={back} /> : null;
    case "proposals-colour":
      return audit ? <ColourProposal families={audit.colourFamilies} onBack={back} /> : null;
    case "proposals-spacing":
      return audit ? (
        <SpacingProposal spacing={audit.spacing} onBack={back} />
      ) : null;
    case "proposals-radius":
      return audit ? (
        <RadiusProposal radius={audit.radius} onBack={back} />
      ) : null;
    case "proposals-shadow":
      return audit ? (
        <ShadowProposal shadow={audit.shadow} onBack={back} />
      ) : null;
    case "proposals-zindex":
      return audit ? (
        <ZIndexProposal zIndex={audit.zIndex ?? []} onBack={back} />
      ) : null;
    case "error":
      return <Failed message={error} onRetry={reset} />;
  }
}
