import { describe, expect, it } from "vitest";
import {
  discoverSitemapUrls,
  parseRobotsSitemaps,
  parseSitemapXml,
  pathToTitle,
  resolveReachableUrl,
  sitemapUrlsToPages,
  urlCandidates,
} from "./sitemap.js";

describe("parseRobotsSitemaps", () => {
  it("extracts Sitemap: directives, case-insensitively", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /wp-admin/",
      "Sitemap: https://ex.com/wp-sitemap.xml",
      "sitemap:   https://ex.com/news.xml",
    ].join("\n");
    expect(parseRobotsSitemaps(robots)).toEqual([
      "https://ex.com/wp-sitemap.xml",
      "https://ex.com/news.xml",
    ]);
  });

  it("returns [] when none present", () => {
    expect(parseRobotsSitemaps("User-agent: *\nDisallow:")).toEqual([]);
  });
});

describe("parseSitemapXml", () => {
  it("reads page URLs from a urlset", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://ex.com/</loc></url>
      <url><loc>https://ex.com/about/</loc></url>
    </urlset>`;
    const r = parseSitemapXml(xml);
    expect(r.pageUrls).toEqual(["https://ex.com/", "https://ex.com/about/"]);
    expect(r.childSitemaps).toEqual([]);
  });

  it("reads child sitemaps from an index, not pages", () => {
    const xml = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://ex.com/wp-sitemap-posts-page-1.xml</loc></sitemap>
      <sitemap><loc>https://ex.com/wp-sitemap-taxonomies-1.xml</loc></sitemap>
    </sitemapindex>`;
    const r = parseSitemapXml(xml);
    expect(r.pageUrls).toEqual([]);
    expect(r.childSitemaps).toHaveLength(2);
  });

  it("decodes XML entities in locs", () => {
    const xml = `<urlset><url><loc>https://ex.com/a?x=1&amp;y=2</loc></url></urlset>`;
    expect(parseSitemapXml(xml).pageUrls).toEqual(["https://ex.com/a?x=1&y=2"]);
  });
});

describe("pathToTitle", () => {
  it("humanises the last path segment", () => {
    expect(pathToTitle("/")).toBe("Home");
    expect(pathToTitle("/eye-conditions/glaucoma/")).toBe("Glaucoma");
    expect(pathToTitle("/services/orthok-lenses/")).toBe("Orthok Lenses");
    expect(pathToTitle("/about-us")).toBe("About Us");
  });
});

describe("sitemapUrlsToPages", () => {
  it("filters out CMS noise (author, category, tag, dated permalinks)", () => {
    const pages = sitemapUrlsToPages(
      "https://ex.com/",
      [
        "https://ex.com/",
        "https://ex.com/services/",
        "https://ex.com/author/admin/",
        "https://ex.com/category/uncategorized/",
        "https://ex.com/2026/05/hello-world/",
      ],
      50,
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/services/"]);
  });

  it("dedupes by path, keeps same-origin, home first, capped", () => {
    const pages = sitemapUrlsToPages(
      "https://ex.com/",
      [
        "https://ex.com/services/",
        "https://ex.com/",
        "https://ex.com/services/", // dupe
        "https://other.com/x", // cross-origin
        "https://ex.com/about/",
      ],
      10,
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/about/", "/services/"]);
    expect(pages[0]!.title).toBe("Home");
  });

  it("respects maxPages while keeping home first", () => {
    const pages = sitemapUrlsToPages(
      "https://ex.com/",
      ["https://ex.com/z/", "https://ex.com/", "https://ex.com/a/"],
      2,
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/a/"]);
  });
});

describe("urlCandidates", () => {
  it("offers apex and www variants for a bare host", () => {
    expect(urlCandidates("studiooptics.com.au")).toEqual([
      "https://studiooptics.com.au/",
      "https://www.studiooptics.com.au/",
    ]);
  });

  it("offers the apex variant for a www URL", () => {
    expect(urlCandidates("https://www.ex.com/")).toEqual([
      "https://www.ex.com/",
      "https://ex.com/",
    ]);
  });
});

describe("resolveReachableUrl", () => {
  it("returns the first candidate that responds ok, following to its final url", async () => {
    const fetchImpl = (async (url: string) => {
      if (url === "https://studiooptics.com.au/") throw new Error("ENOTFOUND");
      return { ok: true, status: 200, url: "https://www.studiooptics.com.au/", text: async () => "" };
    }) as unknown as typeof fetch;
    expect(await resolveReachableUrl("studiooptics.com.au", { fetchImpl })).toBe(
      "https://www.studiooptics.com.au/",
    );
  });

  it("returns null when no candidate responds", async () => {
    const fetchImpl = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    expect(await resolveReachableUrl("nope.invalid", { fetchImpl })).toBeNull();
  });
});

describe("discoverSitemapUrls", () => {
  function mockFetch(map: Record<string, string>): typeof fetch {
    return (async (url: string) => {
      const body = map[String(url)];
      if (body === undefined) return { ok: false, status: 404, text: async () => "" };
      return { ok: true, status: 200, text: async () => body };
    }) as unknown as typeof fetch;
  }

  it("follows robots → index → child sitemaps and collects pages", async () => {
    const fetchImpl = mockFetch({
      "https://ex.com/robots.txt": "Sitemap: https://ex.com/wp-sitemap.xml",
      "https://ex.com/wp-sitemap.xml":
        `<sitemapindex><sitemap><loc>https://ex.com/child-1.xml</loc></sitemap></sitemapindex>`,
      "https://ex.com/child-1.xml":
        `<urlset><url><loc>https://ex.com/</loc></url><url><loc>https://ex.com/eye-conditions/glaucoma/</loc></url></urlset>`,
    });
    const urls = await discoverSitemapUrls("https://ex.com/", { fetchImpl });
    expect(urls).toContain("https://ex.com/eye-conditions/glaucoma/");
  });

  it("falls back to default sitemap paths when robots names none", async () => {
    const fetchImpl = mockFetch({
      "https://ex.com/robots.txt": "User-agent: *",
      "https://ex.com/sitemap.xml": `<urlset><url><loc>https://ex.com/a/</loc></url></urlset>`,
    });
    const urls = await discoverSitemapUrls("https://ex.com/", { fetchImpl });
    expect(urls).toEqual(["https://ex.com/a/"]);
  });

  it("returns null when no sitemap is reachable", async () => {
    const fetchImpl = mockFetch({ "https://ex.com/robots.txt": "User-agent: *" });
    expect(await discoverSitemapUrls("https://ex.com/", { fetchImpl })).toBeNull();
  });
});
