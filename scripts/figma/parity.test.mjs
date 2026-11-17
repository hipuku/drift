import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accept, applyExceptions, diff } from "./diff.mjs";
import { axisName, figmaItems, normaliseString, round } from "./normalise.mjs";
import { axesOf, statesOf, unionAliases } from "./variants.mjs";
import { declaredTokens } from "./code.mjs";

const tmp = (name, body) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "parity-")), name);
  fs.writeFileSync(p, body);
  return p;
};

describe("figmaItems", () => {
  const variables = [
    { name: "radius/sm", codeSyntax: { WEB: "var(--drift-radius-sm)" }, value: 4 },
    {
      name: "radius/control",
      codeSyntax: { WEB: "var(--drift-radius-control)" },
      value: { alias: "--drift-radius-sm" },
    },
    { name: "opacity/40", codeSyntax: { WEB: "var(--drift-opacity-40)" }, value: 40 },
    {
      name: "type/leading/140",
      codeSyntax: { WEB: "var(--drift-type-leading-140)" },
      value: 1.399999976158142,
    },
    {
      name: "color/white",
      codeSyntax: { WEB: "var(--drift-color-white)" },
      value: { hex: "#FFFFFF" },
    },
  ];

  it("follows an alias to its value, as the code side resolves it", () => {
    expect(figmaItems({ variables })["token --drift-radius-control"]).toBe("4");
  });

  it("reads opacity as a fraction, since Figma holds percentages", () => {
    expect(figmaItems({ variables })["token --drift-opacity-40"]).toBe("0.4");
  });

  it("rounds single-precision floats and lowercases hex", () => {
    const items = figmaItems({ variables });
    expect(items["token --drift-type-leading-140"]).toBe("1.4");
    expect(items["token --drift-color-white"]).toBe("#ffffff");
  });

  it("compares axes without case, states lowercased, and skips booleans and parts", () => {
    const items = figmaItems({
      components: [
        {
          name: "Button",
          page: "-> Button",
          inSet: false,
          props: [
            { name: "Variant", type: "VARIANT", options: ["primary", "secondary"] },
            { name: "State", type: "VARIANT", options: ["Default", "Hover", "Pressed", "Focus"] },
            { name: "Mono", type: "VARIANT", options: ["false", "true"] },
          ],
        },
        { name: "Icon/Type", page: "Screens", inSet: false, props: [] },
        { name: "Top bar", page: "Screens", inSet: false, props: [] },
      ],
    });
    expect(items).toEqual({
      "component Button": "component",
      "axis Button.variant": "primary|secondary",
      "states Button": "hover|pressed",
    });
  });
});

describe("variants", () => {
  it("reads double-quoted unions inline and through an alias", () => {
    const tsx = tmp(
      "Badge.tsx",
      'export type BadgeVariant = "neutral" | "info";\ninterface Props {\n  variant?: BadgeVariant;\n  size: "sm" | "md";\n  mono?: boolean;\n}\n',
    );
    expect(axesOf(tsx, "Badge")).toEqual({ variant: ["neutral", "info"], size: ["sm", "md"] });
  });

  it("joins a multi-line union", () => {
    expect(unionAliases('type Role =\n  | "a"\n  | "b";')).toEqual({ Role: ["a", "b"] });
  });

  it("treats a state inside :not() as excluded", () => {
    const css = tmp("x.module.css", ".b:hover:not(:disabled) { color: red }");
    expect(statesOf(css)).toEqual(["hover"]);
  });
});

describe("declaredTokens", () => {
  it("keeps the categories Figma holds as variables", () => {
    const css =
      ":root { --drift-space-4: 1rem; --drift-elevation-lift: 0 1px; /* --drift-color-x: red; */ }";
    expect(declaredTokens(css)).toEqual(["--drift-space-4"]);
  });
});

describe("diff", () => {
  const baseline = { "token --a": { code: "4", figma: "4" } };

  it("fails when code moves and Figma does not", () => {
    const r = diff({ code: { "token --a": "5" }, figma: { "token --a": "4" }, baseline });
    expect(r.findings[0].kind).toBe("code-ahead");
    expect(r.failing).toHaveLength(1);
  });

  it("lets figma-later waive code ahead, never a conflict", () => {
    expect(
      diff({ code: { "token --a": "5" }, figma: { "token --a": "4" }, baseline, figmaLater: true })
        .failing,
    ).toHaveLength(0);
    expect(
      diff({ code: { "token --a": "5" }, figma: { "token --a": "6" }, baseline, figmaLater: true })
        .failing,
    ).toHaveLength(1);
  });

  it("records a Figma-only change as a decision, not a failure", () => {
    const r = diff({ code: { "token --a": "4" }, figma: { "token --a": "6" }, baseline });
    expect(r.findings[0].kind).toBe("figma-changed");
    expect(r.failing).toHaveLength(0);
  });

  it("moves the baseline on accept, and drops an excepted item", () => {
    expect(accept({ code: { "token --a": "5" }, figma: { "token --a": "5" }, baseline })).toEqual({
      "token --a": { code: "5", figma: "5" },
    });
    const { code, stale } = applyExceptions({
      code: { x: "1", y: "2" },
      figma: { y: "3" },
      exceptions: { y: "why" },
    });
    expect(code).toEqual({ x: "1" });
    expect(stale).toEqual([]);
  });
});

describe("normalising", () => {
  it("makes quotes and spacing uniform, and axis names comparable", () => {
    expect(normaliseString("'Fira Code',ui-monospace")).toBe('"Fira Code", ui-monospace');
    expect(axisName("Label position#3:1")).toBe("labelposition");
    expect(round(1.2000000476837158)).toBe("1.2");
  });
});
