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
  getColours,
  getTypography,
  startCrawl,
  type ColourInventory,
  type SiteAudit,
  type TypographyInventory,
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
  | "error";

const PROPOSAL_PHASE: Record<ProposalKind, Phase> = {
  type: "proposals-type",
  colour: "proposals-colour",
  spacing: "proposals-spacing",
  radius: "proposals-radius",
  shadow: "proposals-shadow",
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
  const [typeInventory, setTypeInventory] = useState<TypographyInventory | null>(null);
  const [colourInventory, setColourInventory] = useState<ColourInventory | null>(null);
  const [error, setError] = useState<string>("");

  const crawl = useCrawlProgress(phase === "crawling" ? jobId : null);
  const loadedRef = useRef(false);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  // On crawl completion, fetch the deterministic audit and land on it.
  const loadAudit = useCallback(
    async (id: string) => {
      setPhase("loading");
      try {
        setAudit(await getAudit(id));
        setPhase("audit");
      } catch (err) {
        fail(err instanceof Error ? err.message : "Could not read the design system.");
      }
    },
    [fail],
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

  // Opened from the audit: fetch the proposal inputs, then the hub.
  const openProposals = useCallback(async () => {
    if (!jobId) return;
    setPhase("loading");
    try {
      const [type, colour] = await Promise.all([
        typeInventory ?? getTypography(jobId),
        colourInventory ?? getColours(jobId),
      ]);
      setTypeInventory(type);
      setColourInventory(colour);
      setPhase("proposals");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not load the proposals.");
    }
  }, [jobId, typeInventory, colourInventory, fail]);

  const reset = useCallback(() => {
    loadedRef.current = false;
    setPhase("configure");
    setJobId(null);
    setHost("");
    setAudit(null);
    setTypeInventory(null);
    setColourInventory(null);
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
          onSelect={(kind) => setPhase(PROPOSAL_PHASE[kind])}
          onBack={() => setPhase("audit")}
          audit={audit ?? undefined}
        />
      );
    case "proposals-type":
      return typeInventory ? (
        <TypeScaleProposal inventory={typeInventory} onBack={() => setPhase("proposals")} />
      ) : null;
    case "proposals-colour":
      return colourInventory ? (
        <ColourProposal inventory={colourInventory} onBack={() => setPhase("proposals")} />
      ) : null;
    case "proposals-spacing":
      return audit ? (
        <SpacingProposal spacing={audit.spacing} onBack={() => setPhase("proposals")} />
      ) : null;
    case "proposals-radius":
      return audit ? (
        <RadiusProposal radius={audit.radius} onBack={() => setPhase("proposals")} />
      ) : null;
    case "proposals-shadow":
      return audit ? (
        <ShadowProposal shadow={audit.shadow} onBack={() => setPhase("proposals")} />
      ) : null;
    case "error":
      return <Failed message={error} onRetry={reset} />;
  }
}
