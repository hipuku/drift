/**
 * Colour aggregation and perceptual clustering.
 *
 * This is the standalone form of the work the `cluster_colours` step performs:
 * walk the extraction, tally every colour by where and how often it appears,
 * then group the distinct colours by CIEDE2000 perceptual distance.
 *
 * Perceptual clustering is delegated to haus-colour-utils (the shared,
 * tested implementation). The value added here is usage accounting: how many
 * times each colour appears, in which role (text / background / border), and
 * on which pages. clusterByPerceptualDistance dedupes its input, so frequency
 * — the signal that separates an intentional colour from an accidental one —
 * must be tracked here, before clustering, and folded back in afterward.
 *
 * ## Which background this records
 *
 * Every element carries two: `backgroundColor`, what this element declares,
 * and `effectiveBackgroundColor`, what a reader sees behind it — the nearest
 * non-transparent ancestor, or the page canvas.
 *
 * This module records the **authored** one, and only that. It is an inventory
 * of the colours a site chose, so an element that declares nothing contributes
 * nothing. Recording the effective value would credit the page canvas to every
 * element that merely sits on it, inflating one colour past every real one and
 * filling the family view with white nobody wrote.
 *
 * `contrast.ts` takes the opposite value for the opposite reason: it asks what
 * a reader perceives, and inheritance is exactly what it needs. The two
 * disagreeing is the intended design, not an oversight — asserted in this
 * module's tests and in contrast's, so neither drifts into the other's rule.
 */

import { clusterByPerceptualDistance } from "haus-colour-utils";
import type { CrawlResult } from "../crawler/types.js";

export type ColourRole = "text" | "background" | "border";

/**
 * CIEDE2000 ΔE below which two colours are *perceptually indistinguishable* —
 * genuine redundancy, not a deliberate variant. Sits at/under the ~2.3
 * just-noticeable-difference, so an intentional light/mid/dark ramp (steps
 * typically ΔE 8+) is never counted as duplication. Distinct from the looser
 * threshold used to *suggest consolidation* (Proposals), which may group
 * perceptibly-different shades on purpose.
 *
 * The client mirrors this value in `client/src/screens/Audit/auditModel.ts`,
 * because it is a separate package that does not import from here. The two are
 * held in step by the client's `lib/contract.test.ts`, which reads this
 * declaration — so a rename or a change of form there needs updating too.
 *
 * ## What this module's tests cover, and what they do not
 *
 * The CIEDE2000 maths is haus-colour-utils', and is tested there against known
 * pairs. Re-asserting it here would test the dependency twice and pin this
 * module to an implementation it deliberately does not own. What is tested here
 * is everything the delegation cannot cover: the usage accounting, which role a
 * colour was seen in, how frequency survives a dedupe that discards it, and
 * which background this records. Read the count as scope, not as neglect.
 */
export const INDISTINGUISHABLE_DELTA_E = 2;

/** One element type that uses a colour, in a given role, with its count. */
export interface ColourElementUsage {
  tag: string;
  role: ColourRole;
  count: number;
}

export interface ColourUsage {
  hex: string;
  /** Total occurrences across every element on every page. */
  count: number;
  /** Occurrences split by the role the colour played. */
  roles: Record<ColourRole, number>;
  /** Which element types use this colour, in which role — the attribution. */
  elements: ColourElementUsage[];
  /** Distinct page URLs the colour appears on. */
  pages: string[];
}

export interface ColourClusterReport {
  /** Hex closest to the cluster centroid, from colour-utils. */
  representative: string;
  /** Distinct hex values in this cluster. */
  members: string[];
  /** Number of distinct hex values (members.length). */
  size: number;
  /** Summed usage count across all members — the audit-relevant weight. */
  totalUsage: number;
  /** Distinct pages any member appears on. */
  pages: string[];
}

interface MutableUsage {
  hex: string;
  count: number;
  roles: Record<ColourRole, number>;
  /** Keyed by `${tag}|${role}` → count. */
  elements: Map<string, number>;
  pages: Set<string>;
}

/**
 * Tally every colour in the extraction by role, frequency, and page.
 * Returned sorted by total count, most-used first.
 */
export function collectColourUsage(result: CrawlResult): ColourUsage[] {
  const usage = new Map<string, MutableUsage>();

  const record = (hex: string, role: ColourRole, url: string, tag: string): void => {
    const key = hex.toLowerCase();
    let entry = usage.get(key);
    if (!entry) {
      entry = {
        hex: key,
        count: 0,
        roles: { text: 0, background: 0, border: 0 },
        elements: new Map(),
        pages: new Set(),
      };
      usage.set(key, entry);
    }
    entry.count += 1;
    entry.roles[role] += 1;
    const tagKey = `${tag}|${role}`;
    entry.elements.set(tagKey, (entry.elements.get(tagKey) ?? 0) + 1);
    entry.pages.add(url);
  };

  for (const page of result.pages) {
    for (const el of page.elements) {
      const s = el.styles;
      if (s.color) record(s.color, "text", page.url, el.tag);
      // Authored only — see the module comment. `effectiveBackgroundColor` is
      // deliberately not consulted here.
      if (s.backgroundColor) record(s.backgroundColor, "background", page.url, el.tag);
      for (const border of s.borderColor) record(border, "border", page.url, el.tag);
    }
  }

  return [...usage.values()]
    .map((e) => ({
      hex: e.hex,
      count: e.count,
      roles: e.roles,
      elements: [...e.elements.entries()]
        .map(([k, count]) => {
          const [tag, role] = k.split("|");
          return { tag: tag!, role: role as ColourRole, count };
        })
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag) || a.role.localeCompare(b.role)),
      pages: [...e.pages].sort(),
    }))
    .sort((a, b) => b.count - a.count || (a.hex < b.hex ? -1 : 1));
}

/**
 * Cluster the colours in an extraction by perceptual distance, weighted by use.
 * Returns clusters sorted by total usage, most-used first.
 *
 * @param threshold CIEDE2000 ΔE below which two colours are considered the same.
 */
export function clusterColours(result: CrawlResult, threshold = 8): ColourClusterReport[] {
  const usage = collectColourUsage(result);
  if (usage.length === 0) return [];

  const usageByHex = new Map(usage.map((u) => [u.hex, u]));
  const clusters = clusterByPerceptualDistance(
    usage.map((u) => u.hex),
    threshold,
  );

  return clusters
    .map((cluster) => {
      const pages = new Set<string>();
      let totalUsage = 0;
      for (const member of cluster.members) {
        const u = usageByHex.get(member.toLowerCase());
        if (!u) continue;
        totalUsage += u.count;
        for (const p of u.pages) pages.add(p);
      }
      return {
        representative: cluster.representative,
        members: [...cluster.members].sort(),
        size: cluster.size,
        totalUsage,
        pages: [...pages].sort(),
      };
    })
    .sort((a, b) => b.totalUsage - a.totalUsage || (a.representative < b.representative ? -1 : 1));
}
