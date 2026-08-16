import { describe, expect, it } from "vitest";
import type { CrawlResult, ElementStyle, ExtractedElement } from "../crawler/types.js";
import { collectAudit } from "./audit.js";

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

describe("collectAudit", () => {
  const audit = collectAudit(
    crawl([
      el({ color: "#111111", fontFamily: "Inter", fontSize: 32, fontWeight: 700, padding: [8, 0, 8, 0], borderRadius: [4], boxShadow: "0 1px 2px rgba(0,0,0,.1)" }, true, "h1"),
      el({ color: "#1a1a1a", fontFamily: "Inter", fontSize: 16, fontWeight: 400, padding: [4, 0, 4, 0] }, true, "p"),
      el({ color: "#1b1b1b", fontFamily: "Inter", fontSize: 16, fontWeight: 400 }, true, "p"),
      el({ color: "#2563eb", fontFamily: "Inter", fontSize: 16, fontWeight: 500 }, true, "a"),
      el({ backgroundColor: "#ffffff" }, true, "div"),
    ]),
  );

  it("groups colours by family, neutrals together and light→dark", () => {
    const neutral = audit.colourFamilies.find((f) => f.name === "Neutral");
    expect(neutral).toBeTruthy();
    // #111111, #1a1a1a, #1b1b1b, #ffffff are all neutral
    expect(neutral!.swatches.length).toBe(4);
    // sorted light → dark
    expect(neutral!.swatches[0]!.hex).toBe("#ffffff");
    // blue is its own family
    expect(audit.colourFamilies.some((f) => f.name === "Blue")).toBe(true);
  });

  it("reads the real role → size map from tags", () => {
    const h1 = audit.typography.roles.find((r) => r.tag === "h1");
    const p = audit.typography.roles.find((r) => r.tag === "p");
    expect(h1).toEqual({ tag: "h1", px: 32, weight: 700, count: 1 });
    expect(p).toEqual({ tag: "p", px: 16, weight: 400, count: 2 });
    // roles sorted display-first
    expect(audit.typography.roles[0]!.tag).toBe("h1");
  });

  it("summarises the sprawl", () => {
    expect(audit.summary.distinctColours).toBe(5);
    expect(audit.summary.fontFamilies).toBe(1);
    expect(audit.summary.typeSizes).toBe(2); // 16, 32
    expect(audit.summary.spacings).toEqual(expect.any(Number));
    expect(audit.spacing.map((s) => s.value)).toContain(8);
    expect(audit.radius.map((r) => r.value)).toContain(4);
    expect(audit.shadow.length).toBe(1);
  });

  it("merges sub-pixel resolution artifacts into one quantised token", () => {
    // The same authored value (e.g. 0.125rem) resolves to sub-pixel-different
    // pixels across contexts; these must collapse to one token, not several.
    const a = collectAudit(
      crawl([
        el({ padding: [1.96195, 0, 0, 0] }, true, "input"),
        el({ padding: [1.96209, 0, 0, 0] }, true, "input"),
        el({ borderRadius: [3.4597] }, false, "div"),
        el({ borderRadius: [3.46015] }, false, "div"),
      ]),
    );
    const spacings = a.spacing.filter((s) => Math.round(s.value) === 2);
    expect(spacings).toHaveLength(1);
    expect(spacings[0]!.value).toBe(1.96);
    expect(spacings[0]!.count).toBe(2);

    const radii = a.radius.filter((r) => Math.round(r.value) === 3);
    expect(radii).toHaveLength(1);
    expect(radii[0]!.value).toBe(3.46);
    expect(radii[0]!.count).toBe(2);
  });
});
