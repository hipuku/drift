/**
 * Pure normalisation of discovered anchors into a page list.
 *
 * Browser-free and deterministic. Real homepages link to far more than their
 * pages: per-item permalinks, vote/hide actions, query-string instances. The
 * goal here is to surface distinct *pages* (templates), not every anchor, so:
 *
 *  - links are grouped by pathname (so /item?id=1 and /item?id=2 collapse to
 *    one /item entry) and shown with a clean, query-less URL;
 *  - obvious action endpoints (vote, hide, login, …) are dropped;
 *  - titles come from a query-less link's text, falling back to a humanised
 *    path (instance links like "2 hours ago" make poor titles).
 *
 * This is heuristic: a site that genuinely distinguishes pages by query string
 * will be over-collapsed. Acceptable for a representative-sample audit.
 */

import type { DiscoveredPage, NavLink } from "./types.js";

// Endpoints that are actions, not pages. Matched on the last path segment.
const ACTION_SEGMENTS = new Set([
  "vote",
  "unvote",
  "hide",
  "unhide",
  "fave",
  "unfave",
  "flag",
  "unflag",
  "reply",
  "login",
  "logout",
  "forgot",
]);

function cleanTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length === 0 || t.length > 60 ? "" : t;
}

function humanise(path: string): string {
  if (path === "/") return "Home";
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  const base = segment.replace(/[-_]+/g, " ").trim();
  if (base === "") return path;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function normaliseDiscovered(
  rootUrl: string,
  links: NavLink[],
  maxPages = 50,
): DiscoveredPage[] {
  let origin: string;
  try {
    origin = new URL(rootUrl).origin;
  } catch {
    return [];
  }

  // Keyed by pathname so query-string instances collapse to one page.
  const byPath = new Map<string, DiscoveredPage>();
  byPath.set("/", { url: `${origin}/`, path: "/", title: "Home" });

  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.href, rootUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue; // drop mailto/tel/js
    if (u.origin !== origin) continue; // same-origin only

    const path = u.pathname;
    if (path === "/") continue; // home already seeded

    const lastSegment = path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    if (ACTION_SEGMENTS.has(lastSegment)) continue;

    const existing = byPath.get(path);
    if (existing) {
      // A query-less occurrence gives a better title than a humanised fallback.
      if (!u.search && cleanTitle(link.text) && existing.title === humanise(path)) {
        existing.title = cleanTitle(link.text);
      }
      continue;
    }

    if (byPath.size >= maxPages) break;
    const title = !u.search ? cleanTitle(link.text) || humanise(path) : humanise(path);
    byPath.set(path, { url: `${origin}${path}`, path, title });
  }

  return [...byPath.values()];
}
