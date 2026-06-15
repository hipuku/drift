/**
 * Colour aggregation and perceptual clustering.
 *
 * This is the standalone form of the work the `cluster_colours` step performs:
 * walk the extraction, tally every colour by where and how often it appears,
 * then group the distinct colours by CIEDE2000 perceptual distance.
 *
 * Perceptual clustering is delegated to @haus/colour-utils (the shared,
 * tested implementation). The value added here is usage accounting: how many
 * times each colour appears, in which role (text / background / border), and
 * on which pages. clusterByPerceptualDistance dedupes its input, so frequency
 * — the signal that separates an intentional colour from an accidental one —
 * must be tracked here, before clustering, and folded back in afterward.
 */

import { clusterByPerceptualDistance } from "@haus/colour-utils";
import type { CrawlResult } from "../crawler/types.js";

export type ColourRole = "text" | "background" | "border";

export interface ColourUsage {
  hex: string;
  /** Total occurrences across every element on every page. */
  count: number;
  /** Occurrences split by the role the colour played. */
  roles: Record<ColourRole, number>;
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
  pages: Set<string>;
}

/**
 * Tally every colour in the extraction by role, frequency, and page.
 * Returned sorted by total count, most-used first.
 */
export function collectColourUsage(result: CrawlResult): ColourUsage[] {
  const usage = new Map<string, MutableUsage>();

  const record = (hex: string, role: ColourRole, url: string): void => {
    const key = hex.toLowerCase();
    let entry = usage.get(key);
    if (!entry) {
      entry = { hex: key, count: 0, roles: { text: 0, background: 0, border: 0 }, pages: new Set() };
      usage.set(key, entry);
    }
    entry.count += 1;
    entry.roles[role] += 1;
    entry.pages.add(url);
  };

  for (const page of result.pages) {
    for (const el of page.elements) {
      const s = el.styles;
      if (s.color) record(s.color, "text", page.url);
      if (s.backgroundColor) record(s.backgroundColor, "background", page.url);
      for (const border of s.borderColor) record(border, "border", page.url);
    }
  }

  return [...usage.values()]
    .map((e) => ({ hex: e.hex, count: e.count, roles: e.roles, pages: [...e.pages] }))
    .sort((a, b) => b.count - a.count);
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
        members: cluster.members,
        size: cluster.size,
        totalUsage,
        pages: [...pages],
      };
    })
    .sort((a, b) => b.totalUsage - a.totalUsage);
}
