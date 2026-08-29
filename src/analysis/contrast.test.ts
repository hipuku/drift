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

describe("alpha", () => {
  it("measures the colour a reader sees, not the one that was authored", () => {
    // 50% black on white renders as #888888. Evaluated as though it were opaque
    // it measures 18.88 and passes AAA; composited it measures 3.54 and fails
    // AA. Muted secondary text is normally written this way, so a false pass
    // here is the common case.
    const [finding] = collectContrastFindings(result([text("p", "#11111180", "#ffffff")]));

    expect(finding!.ratio).toBe(3.54);
    expect(finding!.passAA).toBe(false);
    expect(finding!.resolvedForeground).toBe("#888888");
  });

  it("composites a translucent background over the page", () => {
    // The probe returns the first ancestor background with any alpha at all,
    // uncomposited, so a 50% panel still arrives translucent.
    const [finding] = collectContrastFindings(result([text("p", "#ffffff", "#00000080")]));

    expect(finding!.resolvedBackground).toBe("#7f7f7f");
    expect(finding!.passAA).toBe(false);
  });

  it("leaves an opaque pair alone and reports no resolved colours", () => {
    const [finding] = collectContrastFindings(result([text("p", "#000000", "#ffffff")]));

    expect(finding!.ratio).toBe(21);
    expect(finding!.resolvedForeground).toBeUndefined();
    expect(finding!.resolvedBackground).toBeUndefined();
  });

  it("puts a translucent pair either side of the AA boundary", () => {
    // #767676 on white is 4.54, just over AA. The same ink at 60% is under it.
    const pass = collectContrastFindings(result([text("p", "#767676", "#ffffff")]))[0]!;
    const fail = collectContrastFindings(result([text("p", "#76767699", "#ffffff")]))[0]!;

    expect(pass.passAA).toBe(true);
    expect(fail.passAA).toBe(false);
  });
});
