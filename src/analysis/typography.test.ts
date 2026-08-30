import { describe, expect, it } from "vitest";
import type { CrawlResult, ElementStyle, ExtractedElement } from "../crawler/types.js";
import { collectTypography } from "./typography.js";

function el(styles: Partial<ElementStyle>, hasText = true, tag = "p"): ExtractedElement {
  return {
    tag,
    hasText,
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
      ...styles,
    },
  };
}

/** A crawl over several pages, so per-page attribution can be asserted. */
function crawlPages(pages: { url: string; elements: ExtractedElement[] }[]): CrawlResult {
  return {
    rootUrl: "https://example.com",
    crawledAt: new Date().toISOString(),
    pages: pages.map((p) => ({
      url: p.url,
      title: p.url,
      elementCount: p.elements.length,
      elements: p.elements,
    })),
  };
}

function crawl(elements: ExtractedElement[]): CrawlResult {
  return {
    rootUrl: "https://example.com",
    crawledAt: new Date().toISOString(),
    pages: [{ url: "https://example.com", title: "Home", elementCount: elements.length, elements }],
  };
}

describe("collectTypography", () => {
  it("tallies families and sizes, ignoring text-less elements", () => {
    const inv = collectTypography(
      crawl([
        el({ fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.5 }),
        el({ fontFamily: "Inter", fontSize: 16, fontWeight: 400 }),
        el({ fontFamily: "Inter", fontSize: 24, fontWeight: 700 }),
        el({ fontFamily: "Georgia", fontSize: 16 }),
        // text-less wrapper — must not count
        el({ fontFamily: "Inter", fontSize: 99 }, false, "div"),
      ]),
    );

    expect(inv.primaryFamily).toBe("Inter");
    expect(inv.families.find((f) => f.family === "Inter")?.count).toBe(3);
    expect(inv.families.find((f) => f.family === "Georgia")?.count).toBe(1);
    expect(inv.sizes.map((s) => s.px)).toEqual([16, 24]); // 99 excluded (text-less)
    expect(inv.sizes.find((s) => s.px === 16)?.weights).toEqual([400]);
    expect(inv.sizes.find((s) => s.px === 24)?.weights).toEqual([700]);
  });

  it("detects the base size as the most common text size", () => {
    const inv = collectTypography(
      crawl([
        el({ fontFamily: "Inter", fontSize: 16 }),
        el({ fontFamily: "Inter", fontSize: 16 }),
        el({ fontFamily: "Inter", fontSize: 16 }),
        el({ fontFamily: "Inter", fontSize: 32 }),
      ]),
    );
    expect(inv.baseSizePx).toBe(16);
  });

  it("returns nulls for an empty crawl", () => {
    const inv = collectTypography(crawl([]));
    expect(inv.baseSizePx).toBeNull();
    expect(inv.primaryFamily).toBeNull();
    expect(inv.sizes).toEqual([]);
  });
});

describe("collectTypography · folding and keying", () => {
  it("folds float noise in sizes to one decimal", () => {
    // A browser reports 15.999999px for a 16px rule after a rem calculation.
    // Left unrounded, one size becomes three and the whole scale reads as drift.
    const r = crawl([
      el({ fontSize: 15.999999 }),
      el({ fontSize: 16 }),
      el({ fontSize: 16.04 }),
    ]);

    const { sizes } = collectTypography(r);

    expect(sizes.map((z) => z.px)).toEqual([16]);
    expect(sizes[0]!.count).toBe(3);
  });

  it("keeps a genuinely different size apart", () => {
    // 16 vs 16.5 is a real distinction at one decimal; folding it would hide a
    // half-pixel size that is worth reporting.
    expect(collectTypography(crawl([el({ fontSize: 16 }), el({ fontSize: 16.5 })])).sizes).toHaveLength(2);
  });

  it("treats a family as one regardless of the casing it was authored in", () => {
    // CSS family names are case-insensitive, so `Inter` and `inter` are the same
    // face. Counting them separately would invent a second family.
    const { families } = collectTypography(crawl([
      el({ fontFamily: "Inter" }),
      el({ fontFamily: "inter" }),
      el({ fontFamily: "INTER" }),
    ]));

    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ family: "Inter", count: 3 });
  });

  it("rounds line-heights to two decimals", () => {
    const { sizes } = collectTypography(crawl([
      el({ fontSize: 16, lineHeight: 1.5001 }),
      el({ fontSize: 16, lineHeight: 1.5 }),
    ]));

    expect(sizes[0]!.lineHeights).toEqual([1.5]);
  });
});

describe("collectTypography · ordering and attribution", () => {
  it("orders sizes smallest first and families most-used first", () => {
    const { sizes, families } = collectTypography(crawl([
      el({ fontFamily: "Rare", fontSize: 32 }),
      el({ fontFamily: "Common", fontSize: 16 }),
      el({ fontFamily: "Common", fontSize: 12 }),
    ]));

    expect(sizes.map((z) => z.px)).toEqual([12, 16, 32]);
    expect(families.map((f) => f.family)).toEqual(["Common", "Rare"]);
  });

  it("dedupes and sorts the weights a size appears at", () => {
    const { sizes } = collectTypography(crawl([
      el({ fontSize: 16, fontWeight: 700 }),
      el({ fontSize: 16, fontWeight: 400 }),
      el({ fontSize: 16, fontWeight: 700 }),
    ]));

    expect(sizes[0]!.weights).toEqual([400, 700]);
  });

  it("records every page a family and a size appear on, without repeats", () => {
    const r = crawlPages([
      { url: "/a", elements: [el({ fontFamily: "Inter", fontSize: 16 }), el({ fontFamily: "Inter", fontSize: 16 })] },
      { url: "/b", elements: [el({ fontFamily: "Inter", fontSize: 16 })] },
    ]);

    const { families, sizes } = collectTypography(r);

    expect(families[0]!.pages).toEqual(["/a", "/b"]);
    expect(sizes[0]!.pages).toEqual(["/a", "/b"]);
    expect(families[0]!.count).toBe(3);
  });

  it("counts a family and a size independently of each other", () => {
    // An element can carry one without the other, and neither absence should
    // suppress the tally of the one that is present.
    const { families, sizes } = collectTypography(crawl([
      el({ fontFamily: "Inter" }),
      el({ fontSize: 16 }),
    ]));

    expect(families).toHaveLength(1);
    expect(sizes).toHaveLength(1);
  });
});

describe("collectTypography · the base size", () => {
  it("is the most common size, not the smallest or the most varied", () => {
    const { baseSizePx } = collectTypography(crawl([
      el({ fontSize: 12 }),
      el({ fontSize: 16 }),
      el({ fontSize: 16 }),
      el({ fontSize: 32 }),
    ]));

    expect(baseSizePx).toBe(16);
  });

  it("breaks a tie towards the smaller size", () => {
    // Body text outnumbers headings in real pages, so on a tie the smaller size
    // is the better guess at body — and it is deterministic either way, which
    // matters more than which one wins.
    expect(collectTypography(crawl([el({ fontSize: 16 }), el({ fontSize: 32 })])).baseSizePx).toBe(16);
    expect(collectTypography(crawl([el({ fontSize: 32 }), el({ fontSize: 16 })])).baseSizePx).toBe(16);
  });

  it("ignores sizes on elements that render no text", () => {
    // A layout wrapper inherits a font-size it never shows. Counting it would
    // let the number of divs decide what body text is.
    const { baseSizePx } = collectTypography(crawl([
      el({ fontSize: 16 }),
      el({ fontSize: 14 }, false),
      el({ fontSize: 14 }, false),
      el({ fontSize: 14 }, false),
    ]));

    expect(baseSizePx).toBe(16);
  });
});
