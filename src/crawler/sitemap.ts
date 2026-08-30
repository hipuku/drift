/**
 * Sitemap-based page discovery.
 *
 * A homepage's anchors only reach pages linked from the homepage, so deep pages
 * (e.g. /eye-conditions/glaucoma/) stay invisible. The reliable, polite way to
 * enumerate a site is its sitemap: fetch robots.txt, follow its `Sitemap:`
 * directive(s), and parse the XML, recursing through sitemap *index* files into
 * their child sitemaps. This finds every published page in a couple of cheap
 * HTTP requests, no headless browser and no hammering the site.
 *
 * The parsing functions are pure and browser-free (unit-tested); the network
 * orchestration takes an injectable `fetchImpl` so it is testable without real
 * requests.
 */

import type { DiscoveredPage } from "./types.js";

const USER_AGENT = "Mozilla/5.0 (compatible; DriftBot/1.0; +https://hipuku.dev/drift)";

/** Tried in order when robots.txt names no sitemap. */
const DEFAULT_SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];

/** Host key that treats www and non-www as the same site (they usually are). */
function hostKey(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

/** Pull every `Sitemap:` directive out of a robots.txt body. */
export function parseRobotsSitemaps(robotsTxt: string): string[] {
  const out: string[] = [];
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'");
}

/**
 * Parse a sitemap document. A file is either a `<sitemapindex>` (its `<loc>`s
 * point to child sitemaps) or a `<urlset>` (its `<loc>`s are pages), never
 * both, so the root element decides how every `<loc>` is classified.
 */
export function parseSitemapXml(xml: string): { pageUrls: string[]; childSitemaps: string[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = decodeXmlEntities(m[1]!.trim());
    if (url) locs.push(url);
  }
  return isIndex ? { pageUrls: [], childSitemaps: locs } : { pageUrls: locs, childSitemaps: [] };
}

/**
 * Whether a path is a real content page rather than CMS scaffolding. Sitemaps
 * often list author pages, taxonomy archives (category/tag), and dated blog
 * permalinks, which are noise for a *design* audit, since they reuse a template already
 * captured by a real page. Heuristic and deliberately conservative.
 */
export function isLikelyContentPath(path: string): boolean {
  if (path === "/") return true;
  const p = path.toLowerCase();
  const noise = [
    /^\/author\//,
    /^\/category\//,
    /^\/tag\//,
    /^\/tags\//,
    /^\/topics?\//,
    /\/feed\/?$/,
    /^\/wp-/,
    /^\/\d{4}\/\d{2}\//, // dated blog permalinks: /2026/05/hello-world/
  ];
  return !noise.some((re) => re.test(p));
}

/** Humanise a URL path into a readable page title (last segment). */
export function pathToTitle(path: string): string {
  if (path === "/" || path === "") return "Home";
  let seg = path.split("/").filter(Boolean).pop() ?? "";
  try {
    seg = decodeURIComponent(seg);
  } catch {
    // keep raw segment
  }
  const base = seg.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (!base) return "Home";
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Dedupe sitemap URLs into same-origin pages, home first, capped. */
export function sitemapUrlsToPages(
  rootUrl: string,
  urls: string[],
  maxPages: number,
): DiscoveredPage[] {
  let rootKey: string;
  try {
    rootKey = hostKey(new URL(rootUrl).hostname);
  } catch {
    return [];
  }

  const byPath = new Map<string, DiscoveredPage>();
  for (const raw of urls) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (hostKey(u.hostname) !== rootKey) continue;
    const path = u.pathname;
    if (byPath.has(path)) continue;
    if (!isLikelyContentPath(path)) continue;
    // Preserve the URL's real origin (the site may canonicalise to www).
    byPath.set(path, { url: `${u.origin}${path}`, path, title: pathToTitle(path) });
  }

  const pages = [...byPath.values()].sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });
  return pages.slice(0, maxPages);
}

/**
 * Candidate URLs to try for a user's input, toggling www. Some sites resolve
 * only at www, others only at the apex, so we try both and let reachability
 * decide. Input may be a bare host ("example.com") or a full URL.
 */
export function urlCandidates(input: string): string[] {
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return [];
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return [];
  const host = u.hostname;
  const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const path = u.pathname === "" ? "/" : u.pathname;
  const mk = (h: string): string => `${u.protocol}//${h}${path}`;
  return [...new Set([mk(host), mk(alt)])];
}

/**
 * Resolve the user's input to a *reachable* URL, trying www/apex variants and
 * following redirects. Returns the final URL (post-redirect) of the first
 * candidate that responds, or null when none do.
 */
export async function resolveReachableUrl(
  input: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  for (const candidate of urlCandidates(input)) {
    try {
      const res = await fetchImpl(candidate, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.url || candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export interface SitemapDiscoveryOptions {
  /** Injectable for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Cap on how many sitemap documents to fetch (index + children). */
  maxSitemaps?: number;
  /** Cap on how many page URLs to collect. */
  maxUrls?: number;
}

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml,text/plain,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Enumerate a site's pages via its sitemap(s). Returns the page URLs, or `null`
 * when no sitemap is reachable (the caller then falls back to link discovery).
 */
export async function discoverSitemapUrls(
  rootUrl: string,
  options: SitemapDiscoveryOptions = {},
): Promise<string[] | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxSitemaps = options.maxSitemaps ?? 15;
  const maxUrls = options.maxUrls ?? 500;

  let origin: string;
  let rootKey: string;
  try {
    const root = new URL(rootUrl);
    origin = root.origin;
    rootKey = hostKey(root.hostname);
  } catch {
    return null;
  }

  // Treat www and non-www as the same site (a non-www root often canonicalises
  // to www, where its sitemaps live).
  const sameSite = (u: string): boolean => {
    try {
      return hostKey(new URL(u).hostname) === rootKey;
    } catch {
      return false;
    }
  };

  // Seed from robots.txt's Sitemap: directives, else the conventional locations.
  const robots = await fetchText(fetchImpl, `${origin}/robots.txt`, timeoutMs);
  let seeds = robots ? parseRobotsSitemaps(robots).filter(sameSite) : [];
  if (seeds.length === 0) seeds = DEFAULT_SITEMAP_PATHS.map((p) => `${origin}${p}`);

  // Breadth-first over the sitemap graph (index → children), collecting pages.
  const seen = new Set<string>();
  const queue = [...seeds];
  const pageUrls: string[] = [];
  let fetched = 0;

  while (queue.length > 0 && fetched < maxSitemaps && pageUrls.length < maxUrls) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);

    const xml = await fetchText(fetchImpl, next, timeoutMs);
    fetched++;
    if (!xml) continue;

    const { pageUrls: pages, childSitemaps } = parseSitemapXml(xml);
    for (const url of pages) pageUrls.push(url);
    for (const child of childSitemaps) {
      if (sameSite(child) && !seen.has(child)) queue.push(child);
    }
  }

  return pageUrls.length > 0 ? pageUrls.slice(0, maxUrls) : null;
}
