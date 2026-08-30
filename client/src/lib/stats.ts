/**
 * Small robust-statistics helpers shared across the fit-to-structure proposals.
 * A proposed ramp should cover the range the site actually uses, not the range
 * a stray outlier implies: one mis-captured `max-width: 1004px` shouldn't push
 * a spacing (or radius) scale twelve steps past anything real.
 */

export interface ValueCount {
  value: number;
  count: number;
}

/**
 * The usage-weighted upper bound of a value distribution. Walks the values in
 * order, accumulating occurrences, and returns the value at which the running
 * total crosses `percentile` of all usage. Rare extreme values (an outlier used
 * a handful of times) fall past the cutoff and are excluded; a large value in
 * genuine, repeated use stays in. Returns 0 for an empty distribution.
 */
export function robustMax(entries: ValueCount[], percentile = 0.97): number {
  const sorted = entries
    .filter((e) => e.value > 0 && e.count > 0)
    .sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return 0;

  const total = sorted.reduce((sum, e) => sum + e.count, 0);
  const cutoff = total * percentile;
  let cumulative = 0;
  for (const e of sorted) {
    cumulative += e.count;
    if (cumulative >= cutoff) return e.value;
  }
  return sorted[sorted.length - 1]!.value;
}
