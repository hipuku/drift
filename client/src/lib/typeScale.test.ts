import { describe, expect, it } from "vitest";

import {
  RATIOS,
  buildScaleToCover,
  classifyAgainstScale,
  detectClosestRatio,
  exportScale,
  nameForStep,
  toCssVariables,
  toDtcg,
  toTailwind,
  type ScaleStep,
} from "./typeScale";

/** A clean major-third ladder off a 16px base, as the analysis would emit it. */
const scale = (): ScaleStep[] => buildScaleToCover(16, 1.25, 12, 40);

describe("nameForStep", () => {
  it("names the base step", () => {
    expect(nameForStep(0)).toBe("base");
  });

  it("names steps above the base", () => {
    expect([1, 2, 3, 8].map(nameForStep)).toEqual(["lg", "xl", "2xl", "7xl"]);
  });

  it("names steps below the base", () => {
    expect([-1, -2, -3, -4].map(nameForStep)).toEqual(["sm", "xs", "2xs", "3xs"]);
  });

  it("falls back to a generated name past the end of either list", () => {
    // Eight names up, four down. Beyond that the name is synthesised rather
    // than undefined, so a very wide ladder still renders.
    expect(nameForStep(9)).toBe("9xl");
    expect(nameForStep(-5)).toBe("5xs");
  });
});

describe("buildScaleToCover", () => {
  it("covers the requested range and lands exactly on the base", () => {
    const steps = scale();
    expect(steps.find((s) => s.step === 0)).toEqual({
      step: 0,
      name: "base",
      px: 16,
      rem: 1,
    });
    expect(steps[0]!.px).toBeLessThanOrEqual(12);
    expect(steps[steps.length - 1]!.px).toBeGreaterThanOrEqual(40);
  });

  it("produces the expected ladder for a major third off 16px", () => {
    expect(scale().map((s) => s.px)).toEqual([10.2, 12.8, 16, 20, 25, 31.3, 39.1, 48.8]);
  });

  it("expresses rem relative to the base, not to the rounded px", () => {
    const steps = scale();
    // 10.24px rounds to 10.2 for display, but rem stays 0.64 (10.24 / 16).
    // Deriving rem from the rounded value would give 0.638 and quietly skew
    // every exported token.
    expect(steps[0]).toMatchObject({ px: 10.2, rem: 0.64 });
  });

  it("returns steps in ascending order with no gaps", () => {
    const steps = scale();
    const numbers = steps.map((s) => s.step);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]! - numbers[i - 1]!).toBe(1);
    }
  });

  it("still returns the base when the requested range sits inside it", () => {
    // min and max both above the base: the range is widened to include it
    // rather than producing a ladder the base does not appear on.
    const steps = buildScaleToCover(16, 1.25, 20, 25);
    expect(steps.some((s) => s.step === 0 && s.px === 16)).toBe(true);
  });
});

describe("detectClosestRatio", () => {
  it("returns null when there is nothing to compare against the base", () => {
    expect(detectClosestRatio([], 16)).toBeNull();
    expect(detectClosestRatio([16], 16)).toBeNull();
  });

  it("returns null for a non-positive base", () => {
    expect(detectClosestRatio([12, 20, 24], 0)).toBeNull();
    expect(detectClosestRatio([12, 20, 24], -16)).toBeNull();
  });

  it("identifies the ratio a clean ladder was built from, with no error", () => {
    const sizes = [-2, -1, 1, 2, 3].map((n) => 16 * 1.25 ** n);
    const fit = detectClosestRatio(sizes, 16);
    expect(fit?.ratio.id).toBe("major-third");
    expect(fit?.error).toBeCloseTo(0, 10);
  });

  it("reports a larger error for sizes that fit no ratio well", () => {
    const clean = detectClosestRatio([20, 25, 31.25], 16);
    const messy = detectClosestRatio([17, 23, 41], 16);
    expect(messy!.error).toBeGreaterThan(clean!.error);
  });

  it("always returns one of the named ratios", () => {
    const fit = detectClosestRatio([19, 27, 33], 16);
    expect(RATIOS.map((r) => r.id)).toContain(fit!.ratio.id);
  });
});

describe("classifyAgainstScale", () => {
  it("marks a size sitting on a step as on-scale", () => {
    const [result] = classifyAgainstScale([25], scale());
    expect(result).toEqual({ px: 25, onScale: true, nearestPx: 25 });
  });

  it("marks a size off every step as off-scale, and names its nearest", () => {
    const [result] = classifyAgainstScale([23], scale());
    expect(result!.onScale).toBe(false);
    expect(result!.nearestPx).toBe(25);
  });

  it("treats the tolerance as inclusive", () => {
    const steps = scale();
    // Default tolerance is 0.75px. Exactly 0.75 away must count as on-scale.
    expect(classifyAgainstScale([25.75], steps)[0]!.onScale).toBe(true);
    expect(classifyAgainstScale([25.76], steps)[0]!.onScale).toBe(false);
  });

  it("honours a custom tolerance", () => {
    const steps = scale();
    expect(classifyAgainstScale([23], steps, 2)[0]!.onScale).toBe(true);
  });

  it("preserves input order and length", () => {
    const sizes = [25, 23, 16, 99];
    const results = classifyAgainstScale(sizes, scale());
    expect(results.map((r) => r.px)).toEqual(sizes);
  });

  it("falls back to the size itself when the scale is empty", () => {
    expect(classifyAgainstScale([18], [])).toEqual([
      { px: 18, onScale: true, nearestPx: 18 },
    ]);
  });
});

describe("exports", () => {
  it("emits CSS custom properties largest first", () => {
    const css = toCssVariables(buildScaleToCover(16, 1.25, 16, 25));
    expect(css).toBe(
      [":root {", "  --text-xl: 1.563rem;", "  --text-lg: 1.25rem;", "  --text-base: 1rem;", "}"].join("\n"),
    );
  });

  it("emits a Tailwind fontSize theme largest first", () => {
    const tw = toTailwind(buildScaleToCover(16, 1.25, 16, 20));
    expect(tw).toContain('"lg": "1.25rem"');
    expect(tw).toContain('"base": "1rem"');
    expect(tw.indexOf('"lg"')).toBeLessThan(tw.indexOf('"base"'));
  });

  it("emits DTCG tokens with a dimension type", () => {
    const parsed = JSON.parse(toDtcg(buildScaleToCover(16, 1.25, 16, 20)));
    expect(parsed.fontSize.base).toEqual({ $type: "dimension", $value: "1rem" });
    expect(parsed.fontSize.lg).toEqual({ $type: "dimension", $value: "1.25rem" });
  });

  it("does not mutate the scale it is handed", () => {
    // Every exporter reverses. Reversing in place would leave the ladder
    // upside down for whichever exporter ran second.
    const steps = scale();
    const before = steps.map((s) => s.step);
    toCssVariables(steps);
    toTailwind(steps);
    toDtcg(steps);
    expect(steps.map((s) => s.step)).toEqual(before);
  });

  it("dispatches on format, defaulting to CSS", () => {
    const steps = buildScaleToCover(16, 1.25, 16, 20);
    expect(exportScale(steps, "css")).toBe(toCssVariables(steps));
    expect(exportScale(steps, "tailwind")).toBe(toTailwind(steps));
    expect(exportScale(steps, "dtcg")).toBe(toDtcg(steps));
  });
});
