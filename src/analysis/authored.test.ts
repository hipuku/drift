import { describe, expect, it } from "vitest";
import type { PageExtraction } from "../crawler/types.js";
import {
  AUTHORED_VALUES_KEPT,
  classifyUnit,
  extractUnits,
  summariseAuthored,
} from "./authored.js";

describe("extractUnits", () => {
  it("reads the unit of a simple value", () => {
    expect(extractUnits("0.5rem")).toEqual(["rem"]);
    expect(extractUnits("8px")).toEqual(["px"]);
    expect(extractUnits("2%")).toEqual(["percent"]);
    expect(extractUnits("1.25em")).toEqual(["em"]);
  });

  it("reads every unit in a shorthand", () => {
    expect(extractUnits("8px 16px")).toEqual(["px", "px"]);
    expect(extractUnits("0.5rem 1rem")).toEqual(["rem", "rem"]);
  });

  it("treats a zero as unit-agnostic and a bare number as unitless", () => {
    expect(extractUnits("0")).toEqual(["zero"]);
    expect(extractUnits("0px")).toEqual(["zero"]);
    expect(extractUnits("1.5")).toEqual(["unitless"]); // line-height
  });

  it("collapses fluid/functional values to one marker", () => {
    expect(extractUnits("clamp(1rem, 2vw, 3rem)")).toEqual(["clamp"]);
    expect(extractUnits("calc(100% - 8px)")).toEqual(["calc"]);
    expect(extractUnits("min(2rem, 5vw)")).toEqual(["calc"]);
  });

  it("ignores var() references — their unit is indirected, not the token-name digits", () => {
    expect(extractUnits("var(--space-4)")).toEqual([]);
    expect(extractUnits("var(--space-4) var(--space-2)")).toEqual([]);
  });

  it("distinguishes rem from em and the viewport units", () => {
    expect(classifyUnit("1rem")).toBe("rem");
    expect(classifyUnit("1em")).toBe("em");
    expect(classifyUnit("10vw")).toBe("vw");
    expect(classifyUnit("10vmin")).toBe("vmin");
    expect(classifyUnit("10vmax")).toBe("vmax");
  });
});

describe("summariseAuthored", () => {
  const page = (authored: PageExtraction["authored"]): PageExtraction => ({
    url: "https://example.com",
    title: "Home",
    elementCount: 0,
    elements: [],
    authored,
  });

  it("tallies units per category and flags px type as an a11y risk", () => {
    const summary = summariseAuthored([
      page({
        declarations: [
          { category: "spacing", value: "0.5rem" },
          { category: "spacing", value: "1rem" },
          { category: "spacing", value: "8px" },
          { category: "type", value: "14px" },
          { category: "type", value: "16px" },
          { category: "type", value: "1.5" }, // line-height, unitless
        ],
        customProperties: [
          { name: "--color-primary", value: "#0055ff" },
          { name: "--space-4", value: "1rem" },
        ],
      }),
    ]);

    const spacing = summary.categories.find((c) => c.category === "spacing")!;
    expect(spacing.dominant).toBe("rem"); // 3 rem (2 usages + the --space-4 token) vs 1 px
    expect(spacing.units).toContainEqual({ unit: "rem", count: 3 });
    expect(spacing.units).toContainEqual({ unit: "px", count: 1 });

    // type is dominantly px → accessibility flag
    expect(summary.typeInPx).toBe(true);

    // custom properties surfaced, sorted, de-duplicated
    expect(summary.customProperties.map((p) => p.name)).toEqual(["--color-primary", "--space-4"]);
  });

  it("reads units from declared tokens when properties use var() indirection", () => {
    // A design-system site authors `padding: var(--space-4)` and declares the
    // real unit once: `--space-4: 1rem`. The var() usage carries no unit; the
    // token value does, and that's what should drive the tally.
    const summary = summariseAuthored([
      page({
        declarations: [
          { category: "spacing", value: "var(--space-4)" },
          { category: "spacing", value: "var(--space-2)" },
        ],
        customProperties: [
          { name: "--space-2", value: "0.5rem" },
          { name: "--space-4", value: "1rem" },
          { name: "--color-primary", value: "#0055ff" },
        ],
      }),
    ]);
    const spacing = summary.categories.find((c) => c.category === "spacing")!;
    expect(spacing.dominant).toBe("rem"); // from the tokens, not the var() usages
    expect(spacing.units).toEqual([{ unit: "rem", count: 2 }]);
  });

  it("does not let a colour token pollute the type unit via a matching prefix", () => {
    const summary = summariseAuthored([
      page({
        declarations: [{ category: "type", value: "16px" }], // real font-size
        customProperties: [
          { name: "--text-primary", value: "#2563eb" }, // a colour — must NOT fold
          { name: "--text-lg", value: "1.125rem" }, // a real font-size token
        ],
      }),
    ]);
    const type = summary.categories.find((c) => c.category === "type")!;
    expect(type.units).toContainEqual({ unit: "px", count: 1 });
    expect(type.units).toContainEqual({ unit: "rem", count: 1 });
    expect(type.units.some((u) => u.unit === "unitless" || u.unit === "other")).toBe(false);
  });

  it("tallies the authored value strings, most-used first", () => {
    const summary = summariseAuthored([
      page({
        declarations: [
          { category: "spacing", value: "1rem" },
          { category: "spacing", value: "1rem" },
          { category: "spacing", value: "calc(var(--space) * 2)" },
          { category: "spacing", value: "8px" },
        ],
        customProperties: [],
      }),
    ]);
    const spacing = summary.categories.find((c) => c.category === "spacing")!;
    expect(spacing.values).toEqual([
      { value: "1rem", count: 2 },
      { value: "8px", count: 1 },
      { value: "calc(var(--space) * 2)", count: 1 },
    ]);
    expect(spacing.valuesDistinct).toBe(3);
  });

  it("keeps arithmetic over a token distinct from the length it resolves to", () => {
    const summary = summariseAuthored([
      page({
        declarations: [
          { category: "spacing", value: "calc(var(--space) * 2)" },
          { category: "spacing", value: "2rem" },
        ],
        customProperties: [],
      }),
    ]);
    const spacing = summary.categories.find((c) => c.category === "spacing")!;
    expect(spacing.values.map((v) => v.value)).toEqual(["2rem", "calc(var(--space) * 2)"]);
  });

  it("truncates the value list but reports the full count", () => {
    const declarations = Array.from({ length: AUTHORED_VALUES_KEPT + 5 }, (_, i) => ({
      category: "spacing" as const,
      value: `${i + 1}px`,
    }));
    const summary = summariseAuthored([page({ declarations, customProperties: [] })]);
    const spacing = summary.categories.find((c) => c.category === "spacing")!;
    expect(spacing.values).toHaveLength(AUTHORED_VALUES_KEPT);
    expect(spacing.valuesDistinct).toBe(AUTHORED_VALUES_KEPT + 5);
  });

  it("counts distinct strings, where the unit tally counts declarations", () => {
    const summary = summariseAuthored([
      page({
        declarations: [
          { category: "type", value: "16px" },
          { category: "type", value: "1.5" }, // line-height: unitless, not zero
          { category: "type", value: "0" }, // zero carries no unit signal
        ],
        customProperties: [],
      }),
    ]);
    const type = summary.categories.find((c) => c.category === "type")!;
    expect(type.total).toBe(2); // two declarations carried a unit
    expect(type.valuesDistinct).toBe(2); // in two different strings
    expect(type.values.map((v) => v.value)).toEqual(["1.5", "16px"]);
  });

  it("de-duplicates custom properties across pages by name", () => {
    const props = { declarations: [], customProperties: [{ name: "--x", value: "1rem" }] };
    const summary = summariseAuthored([page(props), page(props)]);
    expect(summary.customProperties).toHaveLength(1);
  });

  it("omits categories with no authored values", () => {
    const summary = summariseAuthored([page({ declarations: [], customProperties: [] })]);
    expect(summary.categories).toHaveLength(0);
    expect(summary.typeInPx).toBe(false);
  });
});
