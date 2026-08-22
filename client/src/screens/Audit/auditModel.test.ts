import { describe, expect, it } from "vitest";

import {
  INDISTINGUISHABLE_DELTA_E,
  VERDICT_TAB,
  alphaOf,
  capFirst,
  cardId,
  colourish,
  deviceClass,
  healthLine,
  hostOf,
  joinList,
  nearKind,
  niceStep,
  pathOf,
  plural,
  redundancyVerdict,
  sameBaseColour,
  toRem,
  unitLabel,
  usageChips,
  usageText,
} from "./auditModel";
import type { SiteAudit } from "../../lib/api.js";

/** A summary with nothing wrong anywhere, to vary one axis at a time. */
const clean = (over: Partial<SiteAudit["summary"]> = {}): SiteAudit["summary"] =>
  ({
    distinctColours: 20,
    colourNearDuplicates: 0,
    typeSizes: 8,
    typeOffScale: 0,
    spacings: 12,
    spacingOffGrid: 0,
    radii: 4,
    radiusNearDuplicates: 0,
    shadows: 3,
    contrastPairs: 30,
    contrastFailingAA: 0,
    ...over,
  }) as SiteAudit["summary"];

describe("urls", () => {
  it("takes the host, dropping scheme and path", () => {
    expect(hostOf("https://picocss.com/docs?x=1")).toBe("picocss.com");
  });

  it("takes the path, dropping origin and keeping the root slash", () => {
    expect(pathOf("https://picocss.com/docs")).toBe("/docs");
    expect(pathOf("https://picocss.com")).toBe("/");
  });

  it("falls back to the raw string rather than throwing", () => {
    // Crawl data is external. An unparseable url must render as itself.
    expect(hostOf("not a url")).toBe("not a url");
    expect(pathOf("not a url")).toBe("not a url");
  });
});

describe("prose helpers", () => {
  it("pluralises, with an override for irregular words", () => {
    expect(plural(1, "page")).toBe("page");
    expect(plural(2, "page")).toBe("pages");
    expect(plural(1, "holds", "hold")).toBe("holds");
    expect(plural(3, "holds", "hold")).toBe("hold");
    expect(plural(0, "page")).toBe("pages");
  });

  it("joins with an Oxford comma", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinList(["a", "b", "c", "d"])).toBe("a, b, c, and d");
  });

  it("capitalises only the first character", () => {
    expect(capFirst("colour holds steady")).toBe("Colour holds steady");
    expect(capFirst("")).toBe("");
    expect(capFirst("ΔE is fine")).toBe("ΔE is fine");
  });
});

describe("healthLine", () => {
  it("says nothing is drifting when every category holds", () => {
    expect(healthLine(clean())).toBe(
      "Nothing's drifting — colour, type, spacing, radius, shadows, and contrast all hold to a system.",
    );
  });

  it("leads with contrast, because it is the one finding with a consequence", () => {
    const line = healthLine(clean({ contrastFailingAA: 1, colourNearDuplicates: 4 }));
    expect(line.startsWith("1 of 30 text/background pairs fail WCAG AA")).toBe(true);
    expect(line).toContain("4 of 20 colours are near-duplicates");
  });

  it("names each drifting category with its counts", () => {
    const line = healthLine(
      clean({ colourNearDuplicates: 4, typeOffScale: 6, spacingOffGrid: 12, radiusNearDuplicates: 2 }),
    );
    expect(line).toContain("4 of 20 colours are near-duplicates");
    expect(line).toContain("6 of 8 type sizes fall off the scale");
    expect(line).toContain("12 of 12 spacing values miss the 4px grid");
    expect(line).toContain("2 of 4 radii nearly repeat");
  });

  it("agrees the verb with how many categories hold", () => {
    // One clean category takes "holds"; several take "hold".
    const one = healthLine(
      clean({
        colourNearDuplicates: 1,
        typeOffScale: 1,
        spacingOffGrid: 1,
        radiusNearDuplicates: 1,
        shadows: 0,
        contrastFailingAA: 1,
      }),
    );
    expect(one).toBe(
      "1 of 30 text/background pairs fail WCAG AA, 1 of 20 colours are near-duplicates, 1 of 8 type sizes fall off the scale, 1 of 12 spacing values miss the 4px grid, and 1 of 4 radii nearly repeat.",
    );

    const many = healthLine(clean({ colourNearDuplicates: 1 }));
    expect(many).toContain("hold steady.");
  });

  it("omits a category the site does not use", () => {
    // No radii and no shadows means neither is claimed as holding steady.
    const line = healthLine(clean({ radii: 0, shadows: 0 }));
    expect(line).not.toContain("radius");
    expect(line).not.toContain("shadows");
  });

  it("omits contrast when no pair could be measured", () => {
    const line = healthLine(clean({ contrastPairs: 0 }));
    expect(line).not.toContain("contrast");
  });

  it("treats missing counts as zero rather than NaN", () => {
    // The summary is server data; an older payload may omit the newer fields.
    const line = healthLine({ distinctColours: 5, typeSizes: 3, spacings: 4, radii: 0, shadows: 0 } as SiteAudit["summary"]);
    expect(line).not.toContain("NaN");
    expect(line).not.toContain("undefined");
  });

  it("appends extended drift as its own sentence", () => {
    expect(healthLine(clean(), ["opacity", "blur"])).toContain(
      "Also drifting: opacity and blur.",
    );
    expect(healthLine(clean({ colourNearDuplicates: 3 }), ["blur"])).toContain(
      "Also drifting: blur.",
    );
  });

  it("adds no trailing sentence when nothing else is drifting", () => {
    expect(healthLine(clean())).not.toContain("Also drifting");
  });
});

describe("colour identity", () => {
  it("makes a dom-safe id from a hex", () => {
    expect(cardId("#0D7A4F")).toBe("swatch-0D7A4F");
    expect(cardId("#0d7a4fcc")).toBe("swatch-0d7a4fcc");
    // Anything not alphanumeric is stripped, so the id is always a valid selector.
    expect(cardId("rgba(0, 0, 0, .5)")).toBe("swatch-rgba0005");
  });

  it("reads alpha off an 8-digit hex, and defaults opaque", () => {
    expect(alphaOf("#0d7a4f")).toBe(1);
    expect(alphaOf("#0d7a4fff")).toBe(1);
    expect(alphaOf("#0d7a4f00")).toBe(0);
    expect(alphaOf("#0d7a4f80")).toBeCloseTo(128 / 255, 5);
  });

  it("compares the rgb base, ignoring alpha and case", () => {
    expect(sameBaseColour("#0d7a4f", "#0D7A4Fcc")).toBe(true);
    expect(sameBaseColour("#0d7a4f", "#0d7a50")).toBe(false);
  });
});

describe("nearKind", () => {
  it("calls a translucent version of the same colour an opacity variant", () => {
    // ΔE ignores alpha, so these read as ΔE 0. Calling that a perceptual
    // duplicate would tell the user to merge a colour with its own fade.
    expect(nearKind("#0d7a4f", { hex: "#0d7a4f80", deltaE: 0 })).toBe("opacity");
  });

  it("calls a genuinely different colour under the threshold a duplicate", () => {
    expect(nearKind("#0d7a4f", { hex: "#0d7a52", deltaE: 0.4 })).toBe("duplicate");
  });

  it("calls anything above the threshold merely the nearest", () => {
    expect(nearKind("#0d7a4f", { hex: "#993333", deltaE: 40 })).toBe("nearest");
  });

  it("treats the threshold as exclusive", () => {
    expect(nearKind("#0d7a4f", { hex: "#aa3333", deltaE: INDISTINGUISHABLE_DELTA_E })).toBe(
      "nearest",
    );
    expect(
      nearKind("#0d7a4f", { hex: "#aa3333", deltaE: INDISTINGUISHABLE_DELTA_E - 0.001 }),
    ).toBe("duplicate");
  });

  it("is not fooled by the same base at the same alpha", () => {
    // Identical colours are duplicates, not opacity variants.
    expect(nearKind("#0d7a4f", { hex: "#0d7a4f", deltaE: 0 })).toBe("duplicate");
  });
});

describe("colourish", () => {
  it("accepts every concrete colour syntax the crawler may return", () => {
    for (const v of [
      "#fff",
      "#0d7a4fcc",
      "rgb(0 0 0)",
      "rgba(0,0,0,.5)",
      "hsl(120 50% 50%)",
      "hwb(90 10% 10%)",
      "oklch(0.52 0.138 300)",
      "oklab(0.5 0.1 0.1)",
      "lab(50 20 -30)",
      "lch(50 30 200)",
      "color(display-p3 1 0 0)",
    ]) {
      expect(colourish(v), v).toBe(true);
    }
  });

  it("rejects forms that cannot resolve in this document", () => {
    // A var() or calc() would paint an empty box, which reads as a bug.
    expect(colourish("var(--brand)")).toBe(false);
    expect(colourish("rgb(calc(1 * 255) 0 0)")).toBe(false);
    expect(colourish("1rem")).toBe(false);
    expect(colourish("")).toBe(false);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(colourish("  #FFF  ")).toBe(true);
    expect(colourish("  OKLCH(0.5 0.1 200)")).toBe(true);
  });
});

describe("redundancyVerdict", () => {
  it("grades none, a few, and more", () => {
    expect(redundancyVerdict(0)).toBe("good");
    expect(redundancyVerdict(1)).toBe("watch");
    expect(redundancyVerdict(2)).toBe("watch");
    expect(redundancyVerdict(3)).toBe("review");
    expect(redundancyVerdict(40)).toBe("review");
  });
});

describe("usage", () => {
  it("always leads with the usage count, thousands-separated", () => {
    expect(usageChips(1234, 1)).toEqual(["1,234× used"]);
  });

  it("adds a page count only when the crawl covered more than one page", () => {
    // On a single-page crawl "1 page" is noise: every token is on that page.
    expect(usageChips(10, 1, 1)).toEqual(["10× used"]);
    expect(usageChips(10, 5, 3)).toEqual(["10× used", "3 pages"]);
    expect(usageChips(10, 5, 1)).toEqual(["10× used", "1 page"]);
  });

  it("omits the page count when the token has none", () => {
    expect(usageChips(10, 5)).toEqual(["10× used"]);
  });

  it("renders the chips as one middot-separated line", () => {
    expect(usageText(10, 5, 3)).toBe("10× used · 3 pages");
  });
});

describe("units", () => {
  it("labels the units that need a friendlier name", () => {
    expect(unitLabel("percent")).toBe("%");
    expect(unitLabel("unitless")).toBe("unitless");
    expect(unitLabel("clamp")).toBe("clamp()");
    expect(unitLabel("calc")).toBe("calc()");
  });

  it("passes through units that are already their own label", () => {
    expect(unitLabel("px")).toBe("px");
    expect(unitLabel("rem")).toBe("rem");
  });

  it("converts px to rem against a 16px base, trimming trailing zeros", () => {
    expect(toRem(16)).toBe("1rem");
    expect(toRem(24)).toBe("1.5rem");
    expect(toRem(0)).toBe("0rem");
    expect(toRem(1)).toBe("0.0625rem");
  });

  it("does not emit floating-point noise", () => {
    // 13 / 16 is exact, but 15 / 16 * 100 style arithmetic elsewhere is not;
    // the 4dp round plus unary + is what keeps these readable.
    expect(toRem(13)).toBe("0.8125rem");
    expect(toRem(15.5)).toBe("0.9688rem");
  });
});

describe("niceStep", () => {
  it("snaps to 1, 2, 5 or 10 times a power of ten", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(9)).toBe(10);
    expect(niceStep(23)).toBe(50);
    expect(niceStep(210)).toBe(500);
  });

  it("works below one", () => {
    expect(niceStep(0.4)).toBe(0.5);
  });
});

describe("deviceClass", () => {
  it("bands a breakpoint", () => {
    expect(deviceClass(320)).toBe("mobile");
    expect(deviceClass(639)).toBe("mobile");
    expect(deviceClass(640)).toBe("tablet");
    expect(deviceClass(1023)).toBe("tablet");
    expect(deviceClass(1024)).toBe("desktop");
    expect(deviceClass(2560)).toBe("desktop");
  });
});

describe("VERDICT_TAB", () => {
  it("maps every overview card label to a tab id", () => {
    // A card whose label is missing here renders as an unclickable dead end.
    expect(Object.keys(VERDICT_TAB)).toEqual([
      "Colours",
      "Type",
      "Spacing",
      "Radius",
      "Shadows",
      "Border",
      "Opacity",
      "Z-index",
      "Blur",
      "Breakpoints",
      "Gradient",
      "Motion",
    ]);
    expect(new Set(Object.values(VERDICT_TAB)).size).toBe(Object.keys(VERDICT_TAB).length);
  });
});
