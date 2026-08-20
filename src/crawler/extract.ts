/**
 * In-page extraction — the crawl-specific half.
 *
 * The per-element style probe moved to `haus-style-probe`; what remains here is
 * what only a crawler needs: links to follow, breakpoints, and the authored
 * declarations read from the CSSOM.
 *
 * These functions are serialised and executed inside the browser context via
 * page.evaluate. They must be fully self-contained: no imports, no references
 * to Node-side scope. They return only plain data; all parsing happens later,
 * Node-side.
 */

import type { MediaBreakpoint, RawAuthoredCss, RawAuthoredDeclaration, RawCustomProperty } from "./types.js";

/** Runs in the browser. Returns absolute href strings for every anchor. */
export function extractLinks(): string[] {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  return anchors.map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
}

/**
 * Runs in the browser. Pulls min/max-width breakpoints from every accessible
 * @media rule. Cross-origin stylesheets throw on `.cssRules` and are skipped.
 */
export function extractBreakpoints(): MediaBreakpoint[] {
  const out: MediaBreakpoint[] = [];
  const re = /(min|max)-width\s*:\s*([\d.]+)(px|r?em)/g;
  for (const sheet of Array.from(document.styleSheets)) {
    let stack: CSSRule[];
    try {
      stack = sheet.cssRules ? Array.from(sheet.cssRules) : [];
    } catch {
      continue; // cross-origin — not readable
    }
    while (stack.length) {
      const rule = stack.pop();
      if (!rule) continue;
      if (rule instanceof CSSMediaRule) {
        const cond = rule.conditionText || rule.media.mediaText || "";
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(cond)) !== null) {
          const raw = parseFloat(m[2]!);
          const px = m[3] === "px" ? raw : raw * 16;
          if (Number.isFinite(px) && px > 0) out.push({ type: m[1] as "min" | "max", value: Math.round(px) });
        }
      }
      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules) for (const r of Array.from(grouping.cssRules)) stack.push(r);
    }
  }
  return out;
}

/**
 * Runs in the browser. Reads *authored* values from every accessible stylesheet
 * (the CSSOM), which `getComputedStyle` discards. Returns raw value strings —
 * unit classification happens Node-side. Cross-origin sheets throw on `.cssRules`
 * and are skipped, exactly as `extractBreakpoints` does.
 */
export function extractAuthoredDeclarations(): RawAuthoredCss {
  // property name (as it appears in a rule) → the category it belongs to.
  const PROP_CATEGORY: Record<string, RawAuthoredDeclaration["category"]> = {
    padding: "spacing",
    "padding-top": "spacing",
    "padding-right": "spacing",
    "padding-bottom": "spacing",
    "padding-left": "spacing",
    margin: "spacing",
    "margin-top": "spacing",
    "margin-right": "spacing",
    "margin-bottom": "spacing",
    "margin-left": "spacing",
    gap: "spacing",
    "row-gap": "spacing",
    "column-gap": "spacing",
    // Only font-size — the type-scale unit people mean. Line-height (usually
    // unitless) and letter-spacing (usually em) would muddy the "Type" unit and,
    // worse, the px-font-size accessibility flag, so they're left out.
    "font-size": "type",
    "border-radius": "radius",
    "border-top-left-radius": "radius",
    "border-top-right-radius": "radius",
    "border-bottom-right-radius": "radius",
    "border-bottom-left-radius": "radius",
    "border-width": "border",
    "border-top-width": "border",
    "border-right-width": "border",
    "border-bottom-width": "border",
    "border-left-width": "border",
  };

  const declarations: RawAuthoredDeclaration[] = [];
  const customProperties: RawCustomProperty[] = [];
  const seenCustom = new Set<string>();

  for (const sheet of Array.from(document.styleSheets)) {
    let stack: CSSRule[];
    try {
      stack = sheet.cssRules ? Array.from(sheet.cssRules) : [];
    } catch {
      continue; // cross-origin — not readable
    }
    while (stack.length) {
      const rule = stack.pop();
      if (!rule) continue;

      const styleRule = rule as CSSStyleRule;
      if (styleRule.style && typeof styleRule.selectorText === "string") {
        const style = styleRule.style;
        const isRoot = /(^|,)\s*(:root|html)\b/.test(styleRule.selectorText);
        for (let i = 0; i < style.length; i++) {
          const prop = style[i]!;
          const value = style.getPropertyValue(prop).trim();
          if (!value) continue;
          if (prop.startsWith("--")) {
            if (isRoot && !seenCustom.has(prop)) {
              seenCustom.add(prop);
              customProperties.push({ name: prop, value });
            }
            continue;
          }
          const category = PROP_CATEGORY[prop];
          if (category) declarations.push({ category, value });
        }
      }

      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules) for (const r of Array.from(grouping.cssRules)) stack.push(r);
    }
  }

  return { declarations, customProperties };
}

/** Runs in the browser. Returns href + link text for every anchor (for discovery). */
export function extractNavLinks(): { href: string; text: string }[] {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  return anchors
    .map((a) => {
      const el = a as HTMLAnchorElement;
      return { href: el.href, text: (el.textContent ?? "").trim() };
    })
    .filter((l) => l.href);
}
