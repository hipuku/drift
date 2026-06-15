import { describe, expect, it } from "vitest";
import {
  firstFontFamily,
  normaliseBoxShadow,
  normaliseElement,
  normaliseFontWeight,
  normaliseLetterSpacing,
  normaliseLineHeight,
  pxToNumber,
  rgbToHex,
} from "./normalise.js";
import type { RawElement } from "./types.js";

describe("rgbToHex", () => {
  it("converts opaque rgb to hex", () => {
    expect(rgbToHex("rgb(255, 255, 255)")).toBe("#ffffff");
    expect(rgbToHex("rgb(0, 0, 0)")).toBe("#000000");
    expect(rgbToHex("rgb(26, 26, 26)")).toBe("#1a1a1a");
  });

  it("appends an alpha pair for partial alpha", () => {
    expect(rgbToHex("rgba(255, 0, 0, 0.5)")).toBe("#ff000080");
    expect(rgbToHex("rgba(0, 0, 0, 1)")).toBe("#000000");
  });

  it("treats fully transparent as no colour", () => {
    expect(rgbToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(rgbToHex("transparent")).toBeNull();
  });

  it("rounds and clamps channel values", () => {
    expect(rgbToHex("rgb(255.6, -3, 128.4)")).toBe("#ff0080");
  });

  it("returns null for unparseable input", () => {
    expect(rgbToHex("")).toBeNull();
    expect(rgbToHex("none")).toBeNull();
    expect(rgbToHex("blue")).toBeNull();
  });
});

describe("firstFontFamily", () => {
  it("takes the first family and strips quotes", () => {
    expect(firstFontFamily('"Helvetica Neue", Arial, sans-serif')).toBe("Helvetica Neue");
    expect(firstFontFamily("Inter, system-ui")).toBe("Inter");
    expect(firstFontFamily("'Fira Code'")).toBe("Fira Code");
  });

  it("returns null for empty input", () => {
    expect(firstFontFamily("")).toBeNull();
  });
});

describe("pxToNumber", () => {
  it("parses px values", () => {
    expect(pxToNumber("16px")).toBe(16);
    expect(pxToNumber("0px")).toBe(0);
    expect(pxToNumber("13.5px")).toBe(13.5);
  });

  it("returns null for non-numeric", () => {
    expect(pxToNumber("auto")).toBeNull();
    expect(pxToNumber("")).toBeNull();
  });
});

describe("normaliseFontWeight", () => {
  it("maps keywords and parses numbers", () => {
    expect(normaliseFontWeight("normal")).toBe(400);
    expect(normaliseFontWeight("bold")).toBe(700);
    expect(normaliseFontWeight("600")).toBe(600);
  });
});

describe("normaliseLineHeight", () => {
  it("returns null for normal", () => {
    expect(normaliseLineHeight("normal", 16)).toBeNull();
  });

  it("converts px to a unitless ratio against font-size", () => {
    expect(normaliseLineHeight("24px", 16)).toBe(1.5);
  });

  it("keeps a bare numeric ratio", () => {
    expect(normaliseLineHeight("1.5", 16)).toBe(1.5);
  });

  it("returns null for px without a font-size", () => {
    expect(normaliseLineHeight("24px", null)).toBeNull();
  });
});

describe("normaliseLetterSpacing", () => {
  it("returns 0 for normal", () => {
    expect(normaliseLetterSpacing("normal", 16)).toBe(0);
  });

  it("converts px to em against font-size", () => {
    expect(normaliseLetterSpacing("1.6px", 16)).toBe(0.1);
    expect(normaliseLetterSpacing("0.16px", 16)).toBe(0.01);
  });
});

describe("normaliseBoxShadow", () => {
  it("returns null for none", () => {
    expect(normaliseBoxShadow("none")).toBeNull();
  });

  it("keeps a real shadow", () => {
    expect(normaliseBoxShadow("rgba(0, 0, 0, 0.1) 0px 1px 2px 0px")).toBe(
      "rgba(0, 0, 0, 0.1) 0px 1px 2px 0px",
    );
  });
});

describe("normaliseElement", () => {
  const raw: RawElement = {
    tag: "button",
    hasText: true,
    raw: {
      color: "rgb(255, 255, 255)",
      backgroundColor: "rgb(0, 31, 63)",
      borderTopColor: "rgb(0, 31, 63)",
      borderRightColor: "rgb(0, 31, 63)",
      borderBottomColor: "rgb(0, 31, 63)",
      borderLeftColor: "rgb(204, 0, 0)",
      borderTopWidth: "1px",
      borderRightWidth: "1px",
      borderBottomWidth: "1px",
      borderLeftWidth: "0px",
      fontFamily: '"Inter", sans-serif',
      fontSize: "16px",
      fontWeight: "600",
      lineHeight: "24px",
      letterSpacing: "0.16px",
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px",
      borderBottomRightRadius: "8px",
      borderBottomLeftRadius: "8px",
      boxShadow: "none",
      paddingTop: "8px",
      paddingRight: "16px",
      paddingBottom: "8px",
      paddingLeft: "16px",
    },
  };

  it("excludes border colours on zero-width sides", () => {
    const el = normaliseElement(raw);
    // Left border is red but 0px wide, so it must not appear.
    expect(el.styles.borderColor).toEqual(["#001f3f"]);
    expect(el.styles.borderColor).not.toContain("#cc0000");
  });

  it("produces a fully normalised element", () => {
    const el = normaliseElement(raw);
    expect(el).toEqual({
      tag: "button",
      hasText: true,
      styles: {
        color: "#ffffff",
        backgroundColor: "#001f3f",
        borderColor: ["#001f3f"],
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.5,
        letterSpacing: 0.01,
        borderRadius: [8],
        boxShadow: null,
        padding: [8, 16, 8, 16],
      },
    });
  });
});
