import { describe, expect, it } from "vitest";

import { robustMax, type ValueCount } from "./stats";

describe("robustMax", () => {
  it("returns 0 for an empty distribution", () => {
    expect(robustMax([])).toBe(0);
  });

  it("returns the single value when only one is in use", () => {
    expect(robustMax([{ value: 16, count: 40 }])).toBe(16);
  });

  it("excludes a rare outlier from the upper bound", () => {
    // The case the module's own comment describes: one mis-captured
    // `max-width: 1004px` must not push a spacing scale past anything real.
    const spacing: ValueCount[] = [
      { value: 4, count: 120 },
      { value: 8, count: 200 },
      { value: 16, count: 150 },
      { value: 32, count: 60 },
      { value: 1004, count: 1 },
    ];
    expect(robustMax(spacing)).toBe(32);
  });

  it("keeps a large value that is in genuine repeated use", () => {
    // Same shape as above, but the large value is used as often as the rest.
    // It is real, so it must survive the cutoff.
    const spacing: ValueCount[] = [
      { value: 4, count: 20 },
      { value: 8, count: 20 },
      { value: 96, count: 200 },
    ];
    expect(robustMax(spacing)).toBe(96);
  });

  it("discards non-positive values and zero-count entries before measuring", () => {
    const entries: ValueCount[] = [
      { value: 0, count: 500 },
      { value: -8, count: 500 },
      { value: 12, count: 3 },
      { value: 24, count: 0 },
    ];
    // Only value 12 survives the filter, so it is both the floor and the bound.
    expect(robustMax(entries)).toBe(12);
  });

  it("returns 0 when every entry is filtered out", () => {
    expect(robustMax([{ value: 0, count: 9 }, { value: -1, count: 9 }])).toBe(0);
  });

  it("does not depend on input order", () => {
    const entries: ValueCount[] = [
      { value: 32, count: 60 },
      { value: 4, count: 120 },
      { value: 1004, count: 1 },
      { value: 8, count: 200 },
      { value: 16, count: 150 },
    ];
    expect(robustMax(entries)).toBe(robustMax([...entries].reverse()));
  });

  it("tightens the bound as the percentile drops", () => {
    const entries: ValueCount[] = [
      { value: 4, count: 10 },
      { value: 8, count: 10 },
      { value: 16, count: 10 },
      { value: 32, count: 10 },
    ];
    expect(robustMax(entries, 1)).toBe(32);
    expect(robustMax(entries, 0.75)).toBe(16);
    expect(robustMax(entries, 0.5)).toBe(8);
    expect(robustMax(entries, 0.25)).toBe(4);
  });

  it("returns the largest surviving value when the cutoff is never crossed", () => {
    // A percentile above 1 can never be reached by the running total; the
    // function must still answer with the top of the distribution, not undefined.
    expect(robustMax([{ value: 4, count: 1 }, { value: 9, count: 1 }], 1.5)).toBe(9);
  });
});
