import { describe, expect, it } from "vitest";
import { collectContrastFindings } from "./contrast.js";
import type { CrawlResult, ExtractedElement } from "../crawler/types.js";

function text(
  tag: string,
  color: string | null,
  effectiveBackgroundColor: string | null,
): ExtractedElement {
  return {
    tag,
    hasText: true,
    styles: {
      color,
      backgroundColor: null,
      effectiveBackgroundColor,
      borderColor: [],
      fontFamily: null,
      fontSize: null,
      fontWeight: null,
      lineHeight: null,
      letterSpacing: 0,
      borderRadius: [],
      boxShadow: null,
      padding: [0, 0, 0, 0],
    },
  };
}

function result(elements: ExtractedElement[]): CrawlResult {
  return {
    rootUrl: "https://example.test/",
    crawledAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { url: "https://example.test/", title: "t", elementCount: elements.length, elements },
    ],
  };
}

describe("collectContrastFindings", () => {
  it("evaluates text pairs and sorts worst contrast first", () => {
    const findings = collectContrastFindings(
      result([
        text("p", "#ffffff", "#001f3f"), // ~16.56, passes everything
        text("span", "#999999", "#ffffff"), // ~2.85, fails AA
      ]),
    );

    expect(findings).toHaveLength(2);

    // Worst first.
    expect(findings[0]!.foreground).toBe("#999999");
    expect(findings[0]!.passAA).toBe(false);

    expect(findings[1]!.foreground).toBe("#ffffff");
    expect(findings[1]!.ratio).toBe(16.56);
    expect(findings[1]!.passAAA).toBe(true);
  });

  it("aggregates identical pairs with counts, tags, and pages", () => {
    const findings = collectContrastFindings(
      result([text("p", "#000000", "#ffffff"), text("a", "#000000", "#ffffff")]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.count).toBe(2);
    expect(new Set(findings[0]!.sampleTags)).toEqual(new Set(["p", "a"]));
    expect(findings[0]!.pages).toEqual(["https://example.test/"]);
  });

  it("ignores elements without text or without a usable pair", () => {
    const noText: ExtractedElement = { ...text("div", "#000000", "#ffffff"), hasText: false };
    const noBg = text("p", "#000000", null);
    expect(collectContrastFindings(result([noText, noBg]))).toEqual([]);
  });
});
