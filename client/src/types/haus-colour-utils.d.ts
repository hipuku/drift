/**
 * Type shim for @haus/colour-utils (client side).
 *
 * Mirrors src/types/haus-colour-utils.d.ts on the server, for the same reason:
 * the package is consumed as TypeScript source via a local file: link and is
 * not yet published with built .d.ts. Type-checking its source directly
 * subjects it to the client's stricter compiler options
 * (noUncheckedIndexedAccess), which it was not written for, and which
 * TypeScript does NOT suppress for .ts files under node_modules.
 *
 * Resolution split:
 *   - tsconfig.json `paths` points type resolution (tsc, editor) here.
 *   - Vite ignores tsconfig paths, so the bundler resolves the real source.
 *
 * When colour-utils ships built declarations from npm, delete this file and the
 * `paths` entry. Imports are unchanged.
 *
 * Declare only the surface the client actually uses.
 */
declare module "@haus/colour-utils" {
  export interface ContrastResult {
    /** WCAG 2.1 contrast ratio, rounded to 2dp. */
    ratio: number;
    /** 4.5:1 — normal text. */
    passAA: boolean;
    /** 7:1 — normal text. */
    passAAA: boolean;
    /** 3:1 — large text (≥18pt, or ≥14pt bold). */
    passAALarge: boolean;
  }

  /** CIEDE2000 perceptual distance between two colours. */
  export function deltaE(a: string, b: string): number;

  /** WCAG 2.1 contrast ratio between two colours, with AA/AAA verdicts. */
  export function wcagContrast(foreground: string, background: string): ContrastResult;

  /** True when the colour is perceptually light (luminance > 0.35). */
  export function isLight(hex: string): boolean;
}
