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
