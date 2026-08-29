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

  it("names the primaries as themselves", () => {
    // The bins are midpoints between measured OKLCH hues, not the HSL numbers.
    // Reusing HSL's boundaries offsets every family by about one place, which is
    // how #ff0000 gets called Orange and #0000ff gets called Purple.
    expect(familiesOf(["#ff0000", "#ffff00", "#00ff00", "#0000ff"])).toEqual({
      "#ff0000": "Red",
      "#ffff00": "Yellow",
      "#00ff00": "Green",
      "#0000ff": "Blue",
    });
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

describe("token thresholds", () => {
  it("drops sub-pixel values and keeps 1px, either side of the floor", () => {
    // Below 1px is browser rounding of a rem or a percentage, not a token.
    const audit = collectAudit(crawl([el({ padding: [0.99, 1, 1.01, 0] }, false, "div")]));
    expect(audit.spacing.map((s) => s.value)).toEqual([1, 1.01]);
  });

  it("counts a spacing value as off-grid only past 0.5px from a multiple of 4", () => {
    const offGrid = (px: number) =>
      collectAudit(crawl([el({ padding: [px, 0, 0, 0] }, false, "div")])).summary.spacingOffGrid;

    expect(offGrid(4)).toBe(0);
    expect(offGrid(8)).toBe(0);
    expect(offGrid(4.5)).toBe(0); // exactly the tolerance, still on grid
    expect(offGrid(4.51)).toBe(1);
    expect(offGrid(6)).toBe(1);
  });

  it("counts radii as near-duplicates at exactly 1px apart, but not beyond", () => {
    const nearDupes = (a: number, b: number) =>
      collectAudit(
        crawl([el({ borderRadius: [a] }, false, "div"), el({ borderRadius: [b] }, false, "div")]),
      ).summary.radiusNearDuplicates;

    expect(nearDupes(4, 4.9)).toBe(1);
    expect(nearDupes(4, 5)).toBe(1); // the boundary is inclusive
    expect(nearDupes(4, 5.1)).toBe(0);
  });
});

describe("the collectors with no coverage", () => {
  it("records opacity below 1 only, quantised to two places", () => {
    const audit = collectAudit(
      crawl([
        el({ opacity: 1 }, false, "div"), // the default, not a token
        el({ opacity: 0.5 }, false, "div"),
        el({ opacity: 0.333 }, false, "div"),
      ]),
    );
    expect(audit.opacity?.map((o) => o.value)).toEqual([0.5, 0.33]);
  });

  it("records z-index including negatives, lowest first, skipping auto", () => {
    const audit = collectAudit(
      crawl([
        el({ zIndex: 10 }, false, "div"),
        el({ zIndex: -1 }, false, "div"),
        el({ zIndex: null }, false, "div"), // auto
        el({ zIndex: 0 }, false, "div"),
      ]),
    );
    expect(audit.zIndex?.map((z) => z.value)).toEqual([-1, 0, 10]);
  });

  it("attributes border widths to the sides that use them", () => {
    // [top, right, bottom, left]; the zero is not a border.
    const audit = collectAudit(crawl([el({ borderWidths: [1, 1, 0, 2] }, false, "table")]));

    const borders = audit.borders ?? [];

    expect(borders.map((b) => ({ value: b.value, count: b.count }))).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 1 },
    ]);
    expect(borders[0]?.sides.map((s) => s.side)).toEqual(["top", "right"]);
    expect(borders[1]?.sides.map((s) => s.side)).toEqual(["left"]);
  });

  it("orders motion durations by value and easings by how often they are used", () => {
    const audit = collectAudit(
      crawl([
        el({ motionDurations: [200, 150], motionEasings: ["ease"] }, false, "div"),
        el({ motionEasings: ["ease", "linear"] }, false, "div"),
      ]),
    );
    expect(audit.motion?.durations.map((d) => d.value)).toEqual([150, 200]);
    expect(audit.motion?.easings.map((e) => e.value)).toEqual(["ease", "linear"]);
    expect(audit.motion?.easings[0]?.count).toBe(2);
  });

  it("collects blur radii and gradients", () => {
    const audit = collectAudit(
      crawl([el({ blur: [4, 8], gradient: "linear-gradient(red,blue)" }, false, "div")]),
    );
    expect(audit.blur?.map((b) => b.value)).toEqual([4, 8]);
    expect(audit.gradients?.map((g) => g.value)).toEqual(["linear-gradient(red,blue)"]);
  });

  it("splits a breakpoint into the min and max queries that use it", () => {
    const audit = collectAudit({
      rootUrl: "https://example.com",
      crawledAt: "2026-01-01T00:00:00.000Z",
      pages: [
        {
          url: "https://example.com",
          title: "Home",
          elementCount: 0,
          elements: [],
          breakpoints: [
            { value: 768, type: "min" },
            { value: 768, type: "max" },
            { value: 1024, type: "min" },
          ],
        },
      ],
    });

    const breakpoints = audit.breakpoints ?? [];

    expect(breakpoints.map((b) => b.value)).toEqual([768, 1024]);
    expect(breakpoints[0]?.count).toBe(2);
    expect(breakpoints[0]?.types.map((t) => t.type).sort()).toEqual(["max", "min"]);
  });
});
