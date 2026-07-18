import { describe, expect, it } from "vitest";
import {
  buildScaleToCover,
  classifyAgainstScale,
  detectClosestRatio,
  nameForStep,
  toCssVariables,
  toDtcg,
  toTailwind,
} from "./typeScale.js";

describe("type scale", () => {
  it("names steps relative to the base", () => {
    expect(nameForStep(0)).toBe("base");
    expect(nameForStep(1)).toBe("lg");
    expect(nameForStep(3)).toBe("2xl");
    expect(nameForStep(-1)).toBe("sm");
    expect(nameForStep(-2)).toBe("xs");
  });

  it("builds a scale from a base that covers the requested range and includes the base", () => {
    const scale = buildScaleToCover(16, 1.25, 12, 40);
    const base = scale.find((s) => s.step === 0)!;
    expect(base.px).toBe(16);
    expect(base.rem).toBe(1);
    // covers down to 12 and up past 40
    expect(Math.min(...scale.map((s) => s.px))).toBeLessThanOrEqual(12);
    expect(Math.max(...scale.map((s) => s.px))).toBeGreaterThanOrEqual(40);
    // a major-third step up from 16 is 20
    expect(scale.find((s) => s.step === 1)?.px).toBe(20);
  });

  it("detects the closest ratio to a clean major-third ladder", () => {
    // 16, 20, 25, 31.25 is exactly base 16 on ratio 1.25
    const fit = detectClosestRatio([16, 20, 25, 31.25], 16);
    expect(fit?.ratio.id).toBe("major-third");
    expect(fit?.error).toBeLessThan(0.01);
  });

  it("flags sizes that fall off a chosen scale", () => {
    const scale = buildScaleToCover(16, 1.25, 12, 40);
    const result = classifyAgainstScale([16, 20, 15, 25], scale);
    const byPx = new Map(result.map((r) => [r.px, r]));
    expect(byPx.get(16)?.onScale).toBe(true);
    expect(byPx.get(20)?.onScale).toBe(true);
    expect(byPx.get(25)?.onScale).toBe(true);
    expect(byPx.get(15)?.onScale).toBe(false); // off-scale (nearest is 16)
    expect(byPx.get(15)?.nearestPx).toBe(16);
  });

  it("exports the scale to CSS, Tailwind, and DTCG", () => {
    const scale = buildScaleToCover(16, 1.25, 16, 25);
    expect(toCssVariables(scale)).toContain("--text-base: 1rem;");
    expect(toTailwind(scale)).toContain('"base": "1rem"');
    expect(JSON.parse(toDtcg(scale)).fontSize.base).toEqual({ $type: "dimension", $value: "1rem" });
  });
});
