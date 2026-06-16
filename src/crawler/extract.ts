/**
 * In-page extraction.
 *
 * `extractRawElements` and `extractLinks` are serialised and executed inside
 * the browser context via page.evaluate. They must be fully self-contained:
 * no imports, no references to Node-side scope. They return only plain data
 * (raw computed-style strings and href strings); all parsing happens later,
 * Node-side, in normalise.ts.
 */

import type { RawElement } from "./types.js";

/** Runs in the browser. Returns untouched computed-style strings per element. */
export function extractRawElements(): RawElement[] {
  const SKIP = new Set(["SCRIPT", "STYLE", "META", "LINK", "HEAD", "NOSCRIPT", "BR", "TEMPLATE"]);
  const out: RawElement[] = [];

  // Note: this runs in the browser. Avoid nested named functions here — the
  // bundler's keepNames helper (__name) does not exist in the page context, so
  // helpers are inlined below rather than extracted.

  const all = document.querySelectorAll("*");
  for (const node of Array.from(all)) {
    const el = node as HTMLElement;
    if (SKIP.has(el.tagName)) continue;

    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    // Effective background: walk ancestors (incl. self) to the first
    // non-transparent background; fall back to the white page canvas.
    let effectiveBg = "rgb(255, 255, 255)";
    let bgNode: Element | null = el;
    while (bgNode) {
      const bg = window.getComputedStyle(bgNode).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1]!.split(/[,/\s]+/).filter(Boolean);
        const alpha = parts.length >= 4 ? parseFloat(parts[3]!) : 1;
        if (alpha > 0) {
          effectiveBg = bg;
          break;
        }
      }
      bgNode = bgNode.parentElement;
    }

    let hasText = false;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim().length > 0) {
        hasText = true;
        break;
      }
    }

    out.push({
      tag: el.tagName.toLowerCase(),
      hasText,
      raw: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        effectiveBackgroundColor: effectiveBg,
        borderTopColor: cs.borderTopColor,
        borderRightColor: cs.borderRightColor,
        borderBottomColor: cs.borderBottomColor,
        borderLeftColor: cs.borderLeftColor,
        borderTopWidth: cs.borderTopWidth,
        borderRightWidth: cs.borderRightWidth,
        borderBottomWidth: cs.borderBottomWidth,
        borderLeftWidth: cs.borderLeftWidth,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        borderTopLeftRadius: cs.borderTopLeftRadius,
        borderTopRightRadius: cs.borderTopRightRadius,
        borderBottomRightRadius: cs.borderBottomRightRadius,
        borderBottomLeftRadius: cs.borderBottomLeftRadius,
        boxShadow: cs.boxShadow,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
      },
    });
  }

  return out;
}

/** Runs in the browser. Returns absolute href strings for every anchor. */
export function extractLinks(): string[] {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  return anchors.map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
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
