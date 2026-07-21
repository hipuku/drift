/**
 * Z-index proposal math — map an arbitrary stacking scatter onto a named ladder.
 *
 * Sites accrete z-index by panic: 1, then 10, then 999, then 9999 to sit on top
 * of the last one. There's no magnitude to preserve — only *order*. So we sort
 * the distinct values, assign each in turn to a canonical layer role (dropdown…
 * toast) with clean, evenly-spaced values, and let the huge gaps collapse.
 * Deterministic; the only judgment (which role a value plays) is left as the
 * ordinal it already implies.
 */

export interface Layer {
  name: string;
  value: number;
}

/** Canonical layer roles in stacking order, evenly spaced with room to insert. */
const CANONICAL: Layer[] = [
  { name: "dropdown", value: 10 },
  { name: "sticky", value: 20 },
  { name: "overlay", value: 30 },
  { name: "modal", value: 40 },
  { name: "popover", value: 50 },
  { name: "toast", value: 60 },
];

/** The role for the nth layer, extending past the canonical set if needed. */
function layerFor(index: number): Layer {
  return CANONICAL[index] ?? { name: `layer-${index + 1}`, value: (index + 1) * 10 };
}

export interface ZAssignment {
  /** The site's current z-index value. */
  current: number;
  /** Its rank in ascending order (0 = lowest). */
  rank: number;
  layer: Layer;
}

/**
 * Assign each distinct z-index, in ascending order, to a canonical layer. The
 * mapping is the proposal: `9999` and `999` become `toast`/`popover`, not four-
 * digit values. Duplicate values collapse to the same layer.
 */
export function assignLayers(values: number[]): ZAssignment[] {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct.map((current, rank) => ({ current, rank, layer: layerFor(rank) }));
}

/** The proposed ladder (deduplicated layers), lowest first. */
export function proposedLadder(values: number[]): Layer[] {
  return assignLayers(values).map((a) => a.layer);
}
