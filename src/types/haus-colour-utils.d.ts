/**
 * Type shim for @haus/colour-utils.
 *
 * Temporary bridge (see DECISIONS). The package is consumed as TypeScript
 * source via a local file: link and is not yet published with built .d.ts.
 * Type-checking its source directly subjects it to Drift's stricter compiler
 * options (noUncheckedIndexedAccess), which it was not written for, and which
 * TypeScript does NOT suppress for .ts files under node_modules.
 *
 * Resolution split:
 *   - tsconfig.json `paths` points type resolution (tsc, editor) here.
 *   - tsconfig.runtime.json clears `paths`, so tsx resolves the real source.
 *   - vitest/vite ignore tsconfig paths and resolve the real source too.
 *
 * When colour-utils ships built declarations from npm, delete this file, the
 * `paths` entry, and tsconfig.runtime.json. Imports are unchanged.
 *
 * Declare only the surface Drift actually uses.
 */
declare module "@haus/colour-utils" {
  export interface ColourCluster {
    /** Hex closest to the cluster centroid. */
    representative: string;
    /** All hex values in the cluster. */
    members: string[];
    size: number;
  }

  /** Groups colours by CIEDE2000 perceptual distance (ΔE < threshold). */
  export function clusterByPerceptualDistance(hexes: string[], threshold?: number): ColourCluster[];

  export interface ContrastResult {
    ratio: number;
    passAA: boolean;
    passAAA: boolean;
    passAALarge: boolean;
  }

  /** WCAG 2.1 contrast ratio and AA/AAA pass/fail between two colours. */
  export function wcagContrast(foreground: string, background: string): ContrastResult;

  /** True when the colour is perceptually light (luminance > 0.35). */
  export function isLight(hex: string): boolean;

  /** Palette colour with the highest contrast against the background. */
  export function suggestTextColour(backgroundHex: string, palette: string[]): string;
}
