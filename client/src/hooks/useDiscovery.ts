/**
 * Page discovery: the request, its failure, and its result.
 *
 * A screen that calls the data surface directly is a hook that has not been
 * written yet. `Configure` held the fetch, the in-flight flag, the error string
 * and the resolved site alongside its selection UI, which meant the one path
 * that matters most — the site that cannot be reached — could only be exercised
 * by rendering the whole screen and driving it through two steps.
 *
 * The status is deliberately a single value rather than a `busy` boolean beside
 * a `pages` array: "discovering", "failed" and "ready with nothing found" are
 * three different screens, and two independent flags can express states that
 * cannot happen.
 */

import { useCallback, useState } from "react";
import { discoverPages } from "../lib/api.js";

export interface DiscoveredPage {
  url: string;
  path: string;
  title: string;
}

/** idle covers "not asked yet" and "asked and failed" — `error` tells them apart. */
export type DiscoveryStatus = "idle" | "discovering" | "ready";

export interface Discovery {
  status: DiscoveryStatus;
  /** Set only after a failed attempt; cleared when the next one starts. */
  error: string | null;
  pages: DiscoveredPage[];
  /** The URL the server resolved to, which may have gained a scheme or www. */
  rootUrl: string;
  /** How the pages were found — "sitemap" or "links". */
  via: string;
  host: string;
  /**
   * Returns the pages found, or null if the attempt failed. The caller needs
   * them in the same tick — reading `pages` straight after awaiting this would
   * see the previous render's value — and null is how a caller distinguishes
   * "failed" from "found nothing", which `pages.length` cannot.
   */
  discover: (url: string) => Promise<DiscoveredPage[] | null>;
  /** A page discovery missed, added by hand. */
  addPage: (page: DiscoveredPage) => void;
  /** Back to the start, keeping nothing — the "change site" path. */
  reset: () => void;
}

export function useDiscovery(): Discovery {
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [rootUrl, setRootUrl] = useState("");
  const [host, setHost] = useState("");
  const [via, setVia] = useState("");

  const discover = useCallback(async (url: string): Promise<DiscoveredPage[] | null> => {
    setStatus("discovering");
    setError(null);
    try {
      const data = await discoverPages(url);
      // `rootUrl` and `host` are required on the response and always sent, so
      // there is nothing to fall back to — a defensive `?? url` here would be
      // dead code that reads as if the server sometimes omits them.
      setPages(data.pages);
      setRootUrl(data.rootUrl);
      setHost(data.host);
      setVia(data.via);
      setStatus("ready");
      return data.pages;
    } catch (e) {
      // The message the API surface produced is the useful one; the fallback is
      // for a thrown non-Error, which a reader can do nothing with either way.
      setError(e instanceof Error ? e.message : "Could not reach the site.");
      setStatus("idle");
      return null;
    }
  }, []);

  const addPage = useCallback((page: DiscoveredPage) => {
    setPages((prev) => [...prev, page]);
  }, []);

  const reset = useCallback(() => setStatus("idle"), []);

  return { status, error, pages, rootUrl, host, via, discover, addPage, reset };
}
