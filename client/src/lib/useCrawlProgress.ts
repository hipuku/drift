/**
 * Live crawl progress for one job.
 *
 * Two channels, two jobs. The WebSocket carries per-page progress as it happens
 * — nice-to-have, best-effort. A poll of `/crawl/:id/result` is the
 * authoritative signal for completion or failure, so a dropped socket (or a
 * crawl that finishes before we subscribe) never strands the UI. The hook owns
 * both and cleans them up on unmount or job change.
 */

import { useEffect, useRef, useState } from "react";
import {
  getCrawlStatus,
  progressSocketUrl,
  type CrawlProgress,
  type CrawlResultMeta,
} from "./api.js";

const POLL_INTERVAL_MS = 1500;

export type CrawlPhase = "running" | "completed" | "failed";

/** One page as it lands during the crawl (accumulated from progress events). */
export interface CrawledPage {
  url: string;
  title?: string;
  elements?: number;
}

export interface CrawlProgressState {
  phase: CrawlPhase;
  progress: CrawlProgress | null;
  /** Pages crawled so far, in the order they landed. */
  crawledPages: CrawledPage[];
  result: CrawlResultMeta | null;
  error: string | null;
}

export function useCrawlProgress(jobId: string | null): CrawlProgressState {
  const [state, setState] = useState<CrawlProgressState>({
    phase: "running",
    progress: null,
    crawledPages: [],
    result: null,
    error: null,
  });

  // Guards async callbacks from writing after the effect for this job is torn
  // down (job change or unmount), avoiding a state update on a stale job.
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    // Reset on every job change — including to null. Otherwise a completed
    // state from a previous crawl lingers, and the next crawl's orchestrator
    // sees a stale "completed" and fetches the audit before the new job has
    // finished (a 409 "the crawl has not finished").
    setState({ phase: "running", progress: null, crawledPages: [], result: null, error: null });
    if (!jobId) return;

    // ── Live progress (best-effort) ──────────────────────────────────────────
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(progressSocketUrl());
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ type: "subscribe", jobId }));
      });
      socket.addEventListener("message", (event) => {
        if (!liveRef.current) return;
        let msg: { type: string; data?: CrawlProgress };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.type === "progress" && msg.data) {
          const data = msg.data;
          setState((s) => {
            if (s.phase !== "running") return s;
            // Append the page that just landed (dedupe on url).
            const crawledPages = s.crawledPages.some((p) => p.url === data.lastUrl)
              ? s.crawledPages
              : [...s.crawledPages, { url: data.lastUrl, title: data.lastTitle, elements: data.lastElements }];
            return { ...s, progress: data, crawledPages };
          });
        }
      });
      // Socket errors are non-fatal: the poll below still resolves the crawl.
      socket.addEventListener("error", () => {});
    } catch {
      socket = null;
    }

    // ── Completion (authoritative) ───────────────────────────────────────────
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const payload = await getCrawlStatus(jobId);
        const { status, result } = payload;
        if (!liveRef.current) return;
        if (status === "completed") {
          setState((s) => ({ ...s, phase: "completed", result }));
          return;
        }
        if (status === "failed" || status === "not_found") {
          setState((s) => ({
            ...s,
            phase: "failed",
            error:
              status === "failed"
                ? // Prefer the worker's reason; it names what actually happened.
                  (payload.error ??
                  "The crawl couldn’t finish — the site may have been slow to load or blocked automated visits. Try again, or pick fewer pages.")
                : "That crawl job has expired. Start a new audit.",
          }));
          return;
        }
      } catch (err) {
        if (!liveRef.current) return;
        // Transient fetch error — keep polling rather than failing the run.
        void err;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();

    return () => {
      liveRef.current = false;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [jobId]);

  return state;
}
