/**
 * Shadow proposal math — order ad-hoc shadows into an elevation ladder.
 *
 * Shadows are CSS strings, so there's no scale to detect: we parse each one's
 * "lift" (vertical offset + blur, weighted by opacity), sort ascending, and
 * assign named elevation levels (sm…). Near-equal shadows collapse into one
 * level — that's the consolidation. We keep each level's most-used shadow as the
 * representative rather than inventing canonical strings: honest and low-risk.
 */

export interface ShadowUsage {
  value: string;
  count: number;
}

export interface ParsedShadow {
  yOffset: number;
  blur: number;
  alpha: number;
}

/**
 * Pull the vertical offset, blur, and opacity from a box-shadow string. Handles
 * the common `offset-x offset-y blur [spread] color` form (first layer only for
 * multi-layer shadows). Missing pieces default to 0 / opaque.
 */
export function parseShadow(value: string): ParsedShadow {
  const firstLayer = value.split(/,(?![^(]*\))/)[0] ?? value; // split layers, not rgba commas
  const lengths = [...firstLayer.matchAll(/-?\d*\.?\d+px/g)].map((m) => parseFloat(m[0]));
  // lengths: [offsetX, offsetY, blur, spread?] — inset shifts this but is rare.
  const yOffset = lengths[1] ?? 0;
  const blur = lengths[2] ?? 0;

  let alpha = 1;
  const rgba = firstLayer.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  if (rgba) alpha = parseFloat(rgba[1]!);
  else if (/rgb\(|#|hsl\(/.test(firstLayer)) alpha = 1;

  return { yOffset, blur, alpha };
}

/** A scalar proxy for perceived elevation — monotonic in offset, blur, opacity. */
export function elevationWeight(p: ParsedShadow): number {
  return (Math.abs(p.yOffset) + p.blur * 0.75) * (0.4 + p.alpha);
}

const LEVEL_NAMES = ["sm", "md", "lg", "xl", "2xl", "3xl"];

export interface ElevationLevel {
  name: string;
  /** The most-used shadow at this level — the token's value. */
  representative: string;
  weight: number;
  /** Every observed shadow folded into this level, most-used first. */
  members: ShadowUsage[];
  totalCount: number;
}

/**
 * Cluster shadows into elevation levels by weight, then name them in order.
 * Shadows whose weights differ by less than `mergeRatio` of the running level's
 * weight fold together (the consolidation). Each level keeps its most-used
 * member as the representative.
 */
export function buildElevationLadder(shadows: ShadowUsage[], mergeRatio = 0.25): ElevationLevel[] {
  const parsed = shadows
    .map((s) => ({ ...s, weight: elevationWeight(parseShadow(s.value)) }))
    .sort((a, b) => a.weight - b.weight);
  if (parsed.length === 0) return [];

  // Group by proximity in weight.
  const groups: (typeof parsed)[] = [];
  for (const s of parsed) {
    const last = groups[groups.length - 1];
    const ref = last?.[0]?.weight ?? 0;
    if (last && Math.abs(s.weight - ref) <= Math.max(ref * mergeRatio, 1)) {
      last.push(s);
    } else {
      groups.push([s]);
    }
  }

  return groups.map((group, i) => {
    const members = group
      .map((g) => ({ value: g.value, count: g.count }))
      .sort((a, b) => b.count - a.count);
    const rep = members[0]!;
    return {
      name: LEVEL_NAMES[i] ?? `${i + 1}`,
      representative: rep.value,
      weight: group[0]!.weight,
      members,
      totalCount: members.reduce((sum, m) => sum + m.count, 0),
    };
  });
}
