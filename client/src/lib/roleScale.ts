/**
 * Role-first type proposal math. A website's type isn't an abstract modular
 * ladder — it's a semantic hierarchy (h1…h6, body, small, button). We already
 * extract which size each tag actually renders at, so the proposal is: name
 * those roles as tokens, and *optionally* regularise them onto a consistent
 * modular ratio so the steps between roles are even. Pure arithmetic.
 */

import { RATIOS, type NamedRatio } from "./typeScale.js";

export interface TypeRole {
  tag: string;
  px: number;
  weight: number | null;
  count: number;
}

/** Human label for a role, for the specimen ladder. */
const ROLE_LABEL: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
  h5: "H5",
  h6: "H6",
  p: "Body",
  a: "Link",
  button: "Button",
  small: "Small",
  label: "Label",
  li: "List item",
  blockquote: "Quote",
};

export function roleLabel(tag: string): string {
  return ROLE_LABEL[tag] ?? tag.toUpperCase();
}

/** Token name for a role (`--text-{token}`). Headings keep their tag. */
const ROLE_TOKEN: Record<string, string> = {
  p: "body",
  a: "link",
  small: "small",
  button: "button",
  label: "label",
  li: "list",
  blockquote: "quote",
};

export function roleToken(tag: string): string {
  return ROLE_TOKEN[tag] ?? tag;
}

/** Roles ordered as a scale: largest first, ties broken by tag for stability. */
export function sortRoles(roles: TypeRole[]): TypeRole[] {
  return roles.slice().sort((a, b) => b.px - a.px || a.tag.localeCompare(b.tag));
}

/** The anchor size — the body (`p`) role if present, else the most-used role. */
export function baseFromRoles(roles: TypeRole[]): number {
  const body = roles.find((r) => r.tag === "p");
  if (body) return body.px;
  const byUse = roles.slice().sort((a, b) => b.count - a.count)[0];
  return byUse?.px ?? 16;
}

export interface RegularizedRole {
  tag: string;
  weight: number | null;
  currentPx: number;
  proposedPx: number;
  /** Modular-scale step relative to the base (0 = body). */
  step: number;
  changed: boolean;
}

/**
 * Snap each role's size to the nearest step of a modular scale anchored at the
 * base. Body stays put (step 0); headings and small text land on clean ratio
 * multiples, so the hierarchy reads as one system instead of ad-hoc sizes.
 */
export function regularizeRoles(roles: TypeRole[], basePx: number, ratio: number): RegularizedRole[] {
  const ln = Math.log(ratio);
  return sortRoles(roles).map((r) => {
    const step = basePx > 0 ? Math.round(Math.log(r.px / basePx) / ln) : 0;
    // Whole pixels — a type token of 39.8px is nobody's idea of a clean scale,
    // and rounding keeps the diff honest: only genuinely off roles move.
    const proposedPx = Math.round(basePx * ratio ** step);
    return {
      tag: r.tag,
      weight: r.weight,
      currentPx: r.px,
      proposedPx,
      step,
      changed: Math.abs(proposedPx - r.px) > 0.5,
    };
  });
}

/** The modular ratio whose steps the role sizes already sit closest to. */
export function detectClosestRatioForRoles(roles: TypeRole[], basePx: number): NamedRatio | null {
  const others = roles.map((r) => r.px).filter((px) => Math.abs(px - basePx) > 0.01);
  if (others.length === 0 || basePx <= 0) return null;

  let best: { ratio: NamedRatio; error: number } | null = null;
  for (const ratio of RATIOS) {
    const ln = Math.log(ratio.ratio);
    let total = 0;
    for (const px of others) {
      const n = Math.round(Math.log(px / basePx) / ln);
      total += Math.abs(px - basePx * ratio.ratio ** n) / px;
    }
    const error = total / others.length;
    if (!best || error < best.error) best = { ratio, error };
  }
  return best?.ratio ?? null;
}
