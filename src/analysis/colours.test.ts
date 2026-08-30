import { describe, expect, it } from "vitest";
import { clusterColours, collectColourUsage } from "./colours.js";
import type { CrawlResult, ExtractedElement } from "../crawler/types.js";

function element(partial: Partial<ExtractedElement["styles"]>): ExtractedElement {
  return {
    tag: "div",
    hasText: false,
    styles: {
      color: null,
      backgroundColor: null,
      effectiveBackgroundColor: null,
      borderColor: [],
      fontFamily: null,
      fontSize: null,
      fontWeight: null,
      lineHeight: null,
      letterSpacing: 0,
      borderRadius: [],
      boxShadow: null,
      padding: [0, 0, 0, 0],
      ...partial,
    },
  };
}

function result(pages: { url: string; elements: ExtractedElement[] }[]): CrawlResult {
  return {
    rootUrl: "https://example.test/",
    crawledAt: "2026-01-01T00:00:00.000Z",
    pages: pages.map((p) => ({
      url: p.url,
      title: p.url,
      elementCount: p.elements.length,
      elements: p.elements,
    })),
  };
}

describe("collectColourUsage", () => {
  it("tallies count, role, and pages per colour", () => {
    const r = result([
      {
        url: "https://example.test/a",
        elements: [
          element({ color: "#001F3F", backgroundColor: "#ffffff" }),
          element({ color: "#001f3f", borderColor: ["#cccccc"] }),
        ],
      },
      {
        url: "https://example.test/b",
        elements: [element({ color: "#001f3f" })],
      },
    ]);

    const usage = collectColourUsage(r);
    const navy = usage.find((u) => u.hex === "#001f3f");

    expect(navy).toBeDefined();
    expect(navy!.count).toBe(3); // case-insensitive merge across 3 elements
    expect(navy!.roles).toEqual({ text: 3, background: 0, border: 0 });
    expect(navy!.pages.sort()).toEqual(["https://example.test/a", "https://example.test/b"]);

    // Sorted most-used first.
    expect(usage[0]!.hex).toBe("#001f3f");
  });

  /**
   * The rule this module and contrast.ts deliberately disagree on. Asserted on
   * both sides so a later edit that "unifies" them fails rather than quietly
   * changing what the family view means.
   */
  it("records the authored background and ignores the effective one", () => {
    const r = result([
      {
        url: "https://example.test/a",
        elements: [
          // Declares nothing; sits on the page canvas. Contributes no colour.
          element({ effectiveBackgroundColor: "#ffffff" }),
          // Declares a panel, and inherits nothing meaningful behind it.
          element({ backgroundColor: "#0d7a4f", effectiveBackgroundColor: "#ffffff" }),
        ],
      },
    ]);

    const usage = collectColourUsage(r);

    expect(usage.map((u) => u.hex)).toEqual(["#0d7a4f"]);
    expect(usage[0]!.roles.background).toBe(1);
  });

  it("ignores null colours and empty borders", () => {
    const r = result([{ url: "https://example.test/a", elements: [element({})] }]);
    expect(collectColourUsage(r)).toEqual([]);
  });
});

describe("clusterColours", () => {
  it("groups perceptually near colours and weights by usage", () => {
    const r = result([
      {
        url: "https://example.test/a",
        elements: [
          // Two near-identical navies (ΔE < 8) → one cluster.
          element({ backgroundColor: "#001f3f" }),
          element({ backgroundColor: "#001f3f" }),
          element({ color: "#001f40" }),
          // White, clearly separate → its own cluster.
          element({ backgroundColor: "#ffffff" }),
        ],
      },
    ]);

    const clusters = clusterColours(r);
    expect(clusters).toHaveLength(2);

    // Most-used cluster first: the navy pair, used 3 times total.
    const navy = clusters[0]!;
    expect(navy.totalUsage).toBe(3);
    expect(navy.size).toBe(2);
    expect(new Set(navy.members)).toEqual(new Set(["#001f3f", "#001f40"]));

    const white = clusters[1]!;
    expect(white.members).toEqual(["#ffffff"]);
    expect(white.totalUsage).toBe(1);
  });

  it("returns nothing for an empty extraction", () => {
    expect(clusterColours(result([]))).toEqual([]);
  });
});
