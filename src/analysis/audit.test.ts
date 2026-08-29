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

describe("collectAudit ordering", () => {
  // A Map iterates in insertion order, so any list built from one reflects the
  // order the crawler visited pages in unless every sort has a tie break. Drift
  // exists to diff two runs, so an unchanged site must produce an identical
  // audit however the crawl was scheduled.

  it("reports the same role size whichever element the crawler saw first", () => {
    const small = el({ fontSize: 16, fontWeight: 400 }, true, "p");
    const large = el({ fontSize: 18, fontWeight: 400 }, true, "p");

    const forwards = collectAudit(crawl([small, large])).typography.roles;
    const backwards = collectAudit(crawl([large, small])).typography.roles;

    expect(forwards).toEqual(backwards);
    // The tie resolves to the smaller size, not to whichever arrived first.
    expect(forwards[0]!.px).toBe(16);
  });

  it("is unchanged when the elements on a page are reordered", () => {
    const elements = [
      el({ color: "#111111", fontFamily: "Inter", fontSize: 16, fontWeight: 400, padding: [8, 0, 0, 0], borderRadius: [4], boxShadow: "0 1px 2px rgba(0,0,0,.1)" }, true, "p"),
      el({ color: "#2563eb", fontFamily: "Roboto", fontSize: 18, fontWeight: 400, padding: [12, 0, 0, 0], borderRadius: [6], boxShadow: "0 2px 4px rgba(0,0,0,.1)" }, true, "p"),
      el({ color: "#dc2626", fontFamily: "Inter", fontSize: 24, fontWeight: 700, effectiveBackgroundColor: "#ffffff" }, true, "h1"),
      el({ color: "#16a34a", fontFamily: "Roboto", fontSize: 24, fontWeight: 700, effectiveBackgroundColor: "#ffffff" }, true, "h2"),
    ];

    expect(collectAudit(crawl([...elements].reverse()))).toEqual(collectAudit(crawl(elements)));
  });

  it("is unchanged when the pages arrive in a different order", () => {
    const page = (url: string, elements: ExtractedElement[]) => ({
      url,
      title: url,
      elementCount: elements.length,
      elements,
    });
    const pages = [
      page("https://example.com/a", [el({ color: "#111111", fontSize: 16, fontWeight: 400 }, true, "p")]),
      page("https://example.com/b", [el({ color: "#2563eb", fontSize: 16, fontWeight: 400 }, true, "p")]),
      page("https://example.com/c", [el({ color: "#dc2626", fontSize: 24, fontWeight: 700 }, true, "h1")]),
    ];
    const site = (order: typeof pages): CrawlResult => ({
      rootUrl: "https://example.com",
      crawledAt: "2026-01-01T00:00:00.000Z",
      pages: order,
    });

    expect(collectAudit(site([...pages].reverse()))).toEqual(collectAudit(site(pages)));
  });
});

describe("colour families", () => {
  const familiesOf = (hexes: string[]) =>
    Object.fromEntries(
      collectAudit(crawl(hexes.map((hex) => el({ color: hex }, true, "p"))))
        .colourFamilies.flatMap((f) => f.swatches.map((s) => [s.hex, f.name] as const)),
    );

  it("keeps tinted neutrals out of the hue families", () => {
    // Every one of these is a grey a design system would ship. HSL saturation
    // put the first three in Blue and the fourth in Orange.
    const families = familiesOf(["#0b0b14", "#101820", "#f7f7fa", "#12100e", "#8a8f98", "#2b2b2b"]);
    for (const hex of Object.keys(families)) expect(families[hex]).toBe("Neutral");
  });

  it("puts pure sRGB red in Orange", () => {
    // #ff0000 is OKLCH hue 29, and 29 is Orange. Perceptually correct and
    // deliberate: widening Red to swallow it would pull genuine oranges in too.
    expect(familiesOf(["#ff0000"])["#ff0000"]).toBe("Orange");
  });

  it("names the hue families a site actually uses", () => {
    expect(familiesOf(["#2563eb", "#16a34a", "#dc2626"])).toEqual({
      "#2563eb": "Blue",
      "#16a34a": "Green",
      "#dc2626": "Red",
    });
  });

  it("sorts a family light to dark by OKLCH lightness", () => {
    const neutral = collectAudit(
      crawl([
        el({ color: "#2b2b2b" }, true, "p"),
        el({ color: "#ffffff" }, true, "p"),
        el({ color: "#8a8f98" }, true, "p"),
      ]),
    ).colourFamilies.find((f) => f.name === "Neutral");

    expect(neutral!.swatches.map((s) => s.hex)).toEqual(["#ffffff", "#8a8f98", "#2b2b2b"]);
  });
});
