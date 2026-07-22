/**
 * Colour rationalisation — turning an observed palette into a semantic one.
 *
 * The audit already knows the *job* every colour does (text / background /
 * border, on which elements, how often). That's the thing generic palette tools
 * can't know, and it's what makes a proposal safe to apply:
 *
 *  1. Merge only what's genuinely redundant — ΔE below the just-noticeable
 *     difference. Anything further apart may be a deliberate state.
 *  2. Split a merge by job. Two colours a user can't tell apart still deserve
 *     separate tokens if one is a border and the other a surface — same value,
 *     different names, independently changeable later.
 *  3. Keep deliberate relatives (hover states, opacity variants) as *named
 *     variants* rather than collapsing them away.
 *  4. Name by role, because `--color-3` is not something anyone can ship.
 *
 * All deterministic; the only judgement is the naming, which the user can edit.
 */

import { deltaE, wcagContrast } from "@haus/colour-utils";
import type { AuditColourFamily, AuditColourSwatch } from "./api.js";
import { hslOf } from "./hue.js";

/** Below the ~2.3 just-noticeable difference — genuine redundancy. */
export const MERGE_DELTA_E = 2;
/** ΔE 2–5 is ambiguous: close enough to be related, far enough to be intentional. */
export const VARIANT_MAX_DELTA_E = 5;
/** Below this saturation a colour reads as a neutral, not a hue. */
const NEUTRAL_SATURATION = 0.12;
/** A related colour used this much less than its sibling looks like a state. */
const STATE_USAGE_RATIO = 0.4;

export type ColourRole = "text" | "background" | "border";

export interface MergedMember {
  hex: string;
  deltaE: number;
  count: number;
}

export interface VariantColour {
  hex: string;
  kind: "hover" | "opacity";
  deltaE: number;
  count: number;
}

export interface PaletteToken {
  /** Suggested token name — editable before export. */
  name: string;
  hex: string;
  count: number;
  pages: number;
  role: ColourRole;
  /** Element tags this colour is used on, most-used first. */
  tags: string[];
  /** Colours folded in because they're perceptually identical and share a job. */
  members: MergedMember[];
  /** Deliberate relatives kept as their own thing. */
  variants: VariantColour[];
}

export interface ContrastPair {
  fg: string;
  bg: string;
  fgName: string;
  bgName: string;
  ratio: number;
  passAA: boolean;
}

export interface PaletteProposal {
  tokens: PaletteToken[];
  contrast: ContrastPair[];
  /** Distinct colours observed. */
  distinct: number;
  /** How many colours fold away into another token. */
  merged: number;
  /** How many were kept as named states rather than merged. */
  variants: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dominantRole(s: AuditColourSwatch): ColourRole {
  const { text, background, border } = s.roles;
  if (border >= text && border >= background) return "border";
  return background > text ? "background" : "text";
}

function topTags(s: AuditColourSwatch): string[] {
  return (s.elements ?? [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((e) => e.tag)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 3);
}

const safeDeltaE = (a: string, b: string): number => {
  try {
    return deltaE(a, b);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * Same RGB, different alpha. ΔE ignores alpha, so these read as identical and
 * would merge — but a translucent overlay is a deliberate, separate thing.
 */
function isOpacityVariant(a: string, b: string): boolean {
  const na = a.replace(/^#/, "").toLowerCase();
  const nb = b.replace(/^#/, "").toLowerCase();
  return na !== nb && na.slice(0, 6) === nb.slice(0, 6);
}

// ── Grouping ─────────────────────────────────────────────────────────────────

interface Group {
  rep: AuditColourSwatch;
  role: ColourRole;
  members: { swatch: AuditColourSwatch; deltaE: number }[];
  variants: VariantColour[];
}

/**
 * Cluster by perceptual identity, then split each cluster by the job its members
 * do. Two identical-looking colours that serve different jobs become two tokens
 * sharing a value — which is how a real system expresses "the border happens to
 * match the surface" without welding them together.
 */
function groupSwatches(swatches: AuditColourSwatch[], threshold: number): Group[] {
  const ordered = swatches.slice().sort((a, b) => b.count - a.count);
  const taken = new Set<string>();
  const groups: Group[] = [];

  for (const s of ordered) {
    if (taken.has(s.hex)) continue;
    taken.add(s.hex);
    const role = dominantRole(s);
    const group: Group = { rep: s, role, members: [], variants: [] };

    for (const other of ordered) {
      if (taken.has(other.hex)) continue;
      // A translucent version of the same colour is a deliberate variant: never
      // merged, and never left to become a token in its own right.
      if (isOpacityVariant(s.hex, other.hex)) {
        group.variants.push({ hex: other.hex, kind: "opacity", deltaE: 0, count: other.count });
        taken.add(other.hex);
        continue;
      }
      const d = safeDeltaE(s.hex, other.hex);
      if (d >= threshold) continue;
      // Same colour — but only fold it in if it's doing the same job.
      if (dominantRole(other) !== role) continue;
      group.members.push({ swatch: other, deltaE: d });
      taken.add(other.hex);
    }
    groups.push(group);
  }

  return groups;
}

/**
 * Attach deliberate relatives. Opacity variants come straight from the audit's
 * own detection; a hover/active state is inferred from evidence — perceptibly
 * but only slightly different, same job, sharing an element, and used far less.
 */
function attachVariants(groups: Group[], swatches: AuditColourSwatch[]): void {
  // Opacity variants were already absorbed during grouping.
  const claimed = new Set(
    groups.flatMap((g) => [
      g.rep.hex,
      ...g.members.map((m) => m.swatch.hex),
      ...g.variants.map((v) => v.hex),
    ]),
  );

  // Hover/active states: unclaimed colours orbiting a token.
  for (const s of swatches) {
    if (claimed.has(s.hex)) continue;
    const role = dominantRole(s);
    const tags = new Set(topTags(s));

    let best: { group: Group; d: number } | null = null;
    for (const group of groups) {
      if (group.role !== role) continue;
      const d = safeDeltaE(group.rep.hex, s.hex);
      if (d < MERGE_DELTA_E || d >= VARIANT_MAX_DELTA_E) continue;
      if (s.count > group.rep.count * STATE_USAGE_RATIO) continue;
      const shares = topTags(group.rep).some((t) => tags.has(t));
      if (!shares) continue;
      if (!best || d < best.d) best = { group, d };
    }
    if (best) {
      best.group.variants.push({ hex: s.hex, kind: "hover", deltaE: best.d, count: s.count });
      claimed.add(s.hex);
    }
  }
}

// ── Naming ───────────────────────────────────────────────────────────────────

/** Status hues, used only for low-usage hue groups — a brand can be any colour. */
function statusName(hue: number): string | null {
  if (hue >= 90 && hue <= 165) return "success";
  if (hue >= 35 && hue < 60) return "warning";
  if (hue < 20 || hue >= 340) return "danger";
  if (hue >= 185 && hue < 250) return "info";
  return null;
}

const ordinal = (base: string, i: number): string =>
  i === 0 ? base : `${base}-${i + 1}`;

/**
 * Name every group by the job it does. Neutrals split into surfaces, ink, and
 * borders ranked by prominence; hues are grouped, the most-used becoming the
 * brand and the rest reading as accents or status colours.
 */
function nameGroups(groups: Group[]): string[] {
  const names = new Array<string>(groups.length);
  const hsl = groups.map((g) => hslOf(g.rep.hex));

  const isNeutral = (i: number): boolean => hsl[i]!.s < NEUTRAL_SATURATION || hsl[i]!.h < 0;

  const neutralIdx = groups.map((_, i) => i).filter(isNeutral);
  const hueIdx = groups.map((_, i) => i).filter((i) => !isNeutral(i));

  // Neutrals, by job. Surfaces run light→dark, ink runs dark→light.
  const byRole = (role: ColourRole) => neutralIdx.filter((i) => groups[i]!.role === role);

  // Ranked by how much of the site they carry: the page background and the body
  // text are the most-used, and those deserve the unqualified names.
  byRole("background")
    .sort((a, b) => groups[b]!.rep.count - groups[a]!.rep.count || hsl[b]!.l - hsl[a]!.l)
    .forEach((idx, i) => {
      names[idx] = ordinal("surface", i);
    });

  byRole("text")
    .sort((a, b) => groups[b]!.rep.count - groups[a]!.rep.count || hsl[a]!.l - hsl[b]!.l)
    .forEach((idx, i) => {
      names[idx] = i === 0 ? "ink" : i === 1 ? "ink-secondary" : ordinal("ink-muted", i - 2);
    });

  byRole("border")
    .sort((a, b) => groups[b]!.rep.count - groups[a]!.rep.count)
    .forEach((idx, i) => {
      names[idx] = ordinal("border", i);
    });

  // Hues, grouped by proximity so a brand and its shades read as one family.
  const used = new Set<number>();
  const families: number[][] = [];
  for (const i of hueIdx.slice().sort((a, b) => groups[b]!.rep.count - groups[a]!.rep.count)) {
    if (used.has(i)) continue;
    used.add(i);
    const fam = [i];
    for (const j of hueIdx) {
      if (used.has(j)) continue;
      const diff = Math.abs(hsl[i]!.h - hsl[j]!.h);
      if (Math.min(diff, 360 - diff) <= 20) {
        fam.push(j);
        used.add(j);
      }
    }
    families.push(fam);
  }

  families.forEach((fam, famIndex) => {
    const lead = fam[0]!;
    let base: string;
    if (famIndex === 0) {
      base = "brand";
    } else {
      // Rare hues that match a status range are almost certainly status colours.
      const status = statusName(hsl[lead]!.h);
      base = status && groups[lead]!.rep.count < groups[families[0]![0]!]!.rep.count * 0.5
        ? status
        : ordinal("accent", famIndex - 1);
    }
    fam.forEach((idx, i) => {
      names[idx] = i === 0 ? base : `${base}-${i + 1}`;
    });
  });

  // Anything unnamed (shouldn't happen) falls back to its role.
  groups.forEach((g, i) => {
    if (!names[i]) names[i] = g.role === "text" ? "ink" : g.role === "border" ? "border" : "surface";
  });

  // De-duplicate defensively.
  const seen = new Map<string, number>();
  return names.map((n) => {
    const hit = seen.get(n) ?? 0;
    seen.set(n, hit + 1);
    return hit === 0 ? n : `${n}-${hit + 1}`;
  });
}

// ── Contrast ─────────────────────────────────────────────────────────────────

/**
 * Text tokens against the surfaces they could plausibly sit on, so a merge can't
 * silently break AA. Deliberately *not* a full cartesian product: pairing every
 * ink against a saturated brand fill invents combinations nobody ships and
 * buries the real failures in false alarms. Neutral surfaces only.
 */
function contrastMatrix(tokens: PaletteToken[]): ContrastPair[] {
  const inks = tokens.filter((t) => t.role === "text");
  const surfaces = tokens.filter(
    (t) => t.role === "background" && hslOf(t.hex).s < NEUTRAL_SATURATION,
  );
  const pairs: ContrastPair[] = [];
  for (const bg of surfaces) {
    for (const fg of inks) {
      try {
        const { ratio, passAA } = wcagContrast(fg.hex, bg.hex);
        pairs.push({ fg: fg.hex, bg: bg.hex, fgName: fg.name, bgName: bg.name, ratio, passAA });
      } catch {
        // Unparseable colour — skip rather than fabricate a result.
      }
    }
  }
  return pairs.sort((a, b) => a.ratio - b.ratio);
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * @param threshold ΔE below which two colours doing the same job are merged.
 *   2 (the default) is the just-noticeable difference — safe. Raising it trades
 *   fidelity for a smaller palette, which is a judgement only the user can make.
 */
export function analysePalette(
  families: AuditColourFamily[],
  threshold: number = MERGE_DELTA_E,
): PaletteProposal {
  const swatches = families.flatMap((f) => f.swatches);
  if (swatches.length === 0) {
    return { tokens: [], contrast: [], distinct: 0, merged: 0, variants: 0 };
  }

  const groups = groupSwatches(swatches, threshold);
  attachVariants(groups, swatches);
  const names = nameGroups(groups);

  const tokens: PaletteToken[] = groups.map((g, i) => ({
    name: names[i]!,
    hex: g.rep.hex,
    count: g.rep.count + g.members.reduce((sum, m) => sum + m.swatch.count, 0),
    pages: new Set([...g.rep.pages, ...g.members.flatMap((m) => m.swatch.pages)]).size,
    role: g.role,
    tags: topTags(g.rep),
    members: g.members.map((m) => ({ hex: m.swatch.hex, deltaE: m.deltaE, count: m.swatch.count })),
    variants: g.variants,
  }));

  return {
    tokens,
    contrast: contrastMatrix(tokens),
    distinct: swatches.length,
    merged: groups.reduce((sum, g) => sum + g.members.length, 0),
    variants: groups.reduce((sum, g) => sum + g.variants.length, 0),
  };
}

/** The old-hex → new-token map: the thing that actually lets someone fix a site. */
export function migrationMap(tokens: PaletteToken[]): { from: string; to: string; token: string; count: number }[] {
  return tokens
    .flatMap((t) => t.members.map((m) => ({ from: m.hex, to: t.hex, token: t.name, count: m.count })))
    .sort((a, b) => b.count - a.count);
}
