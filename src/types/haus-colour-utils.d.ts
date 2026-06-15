/**
 * Type shim for @haus/colour-utils.
 *
 * Temporary bridge (see DECISIONS): the package is consumed as TypeScript
 * source via a local file: link and is not yet published with built .d.ts.
 * Type-checking its source directly would subject it to Drift's stricter
 * compiler options (noUncheckedIndexedAccess), which it was not written for.
 *
 * A tsconfig `paths` mapping points the type resolver here, so tsc checks
 * Drift against this declared surface. Runtime (tsx, vitest) ignores tsconfig
 * paths and resolves the real implementation through node_modules. When
 * colour-utils ships built declarations from npm, delete this file and the
 * `paths` entry — imports are unchanged.
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
