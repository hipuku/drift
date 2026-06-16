import { describe, expect, it } from "vitest";
import { normaliseDiscovered } from "./discoverNormalise.js";
import type { NavLink } from "./types.js";

const root = "https://example.com/";

function links(...pairs: [string, string][]): NavLink[] {
  return pairs.map(([href, text]) => ({ href, text }));
}

describe("normaliseDiscovered", () => {
  it("always includes the root page first", () => {
    expect(normaliseDiscovered(root, [])[0]).toEqual({
      url: "https://example.com/",
      path: "/",
      title: "Home",
    });
  });

  it("keeps same-origin links and drops external ones", () => {
    const pages = normaliseDiscovered(
      root,
      links(
        ["https://example.com/pricing", "Pricing"],
        ["https://twitter.com/example", "Twitter"],
        ["https://docs.other.com/", "Docs"],
      ),
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/pricing"]);
  });

  it("drops non-http protocols", () => {
    const pages = normaliseDiscovered(
      root,
      links(["mailto:hi@example.com", "Email"], ["tel:+123", "Call"], ["javascript:void(0)", "x"]),
    );
    expect(pages.map((p) => p.path)).toEqual(["/"]);
  });

  it("resolves relative hrefs, strips fragments, and dedupes by path", () => {
    const pages = normaliseDiscovered(
      root,
      links(["/about", "About"], ["/about#team", "Team"], ["about", "About again"]),
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/about"]);
    expect(pages[1]!.url).toBe("https://example.com/about");
  });

  it("collapses query-string instances to one template page with a clean URL", () => {
    const pages = normaliseDiscovered(
      root,
      links(
        ["/item?id=1", "2 hours ago"],
        ["/item?id=2", "5 hours ago"],
        ["/item?id=3", "yesterday"],
      ),
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/item"]);
    expect(pages[1]).toEqual({ url: "https://example.com/item", path: "/item", title: "Item" });
  });

  it("drops action endpoints (vote, hide, login, …)", () => {
    const pages = normaliseDiscovered(
      root,
      links(
        ["/vote?id=1&how=up", "Vote"],
        ["/hide?id=1", "hide"],
        ["/login", "Login"],
        ["/pricing", "Pricing"],
      ),
    );
    expect(pages.map((p) => p.path)).toEqual(["/", "/pricing"]);
  });

  it("prefers a query-less link's text for the title", () => {
    const pages = normaliseDiscovered(
      root,
      links(["/news?page=2", "page 2"], ["/news", "News"]),
    );
    expect(pages.find((p) => p.path === "/news")!.title).toBe("News");
  });

  it("titles from link text, falling back to a humanised path", () => {
    const pages = normaliseDiscovered(
      root,
      links(["/pricing", "  Our  Pricing "], ["/case-studies", ""]),
    );
    const byPath = Object.fromEntries(pages.map((p) => [p.path, p.title]));
    expect(byPath["/pricing"]).toBe("Our Pricing");
    expect(byPath["/case-studies"]).toBe("Case studies");
  });

  it("caps the number of pages", () => {
    const many = Array.from({ length: 100 }, (_, i): [string, string] => [`/p${i}`, `P${i}`]);
    expect(normaliseDiscovered(root, links(...many), 10)).toHaveLength(10);
  });

  it("returns nothing for an invalid root", () => {
    expect(normaliseDiscovered("not a url", links(["/a", "A"]))).toEqual([]);
  });
});
