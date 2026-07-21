/**
 * Generic token export for the dimension-shaped proposals — spacing, radius,
 * blur (dimension) and z-index (number). Given named entries, emit CSS custom
 * properties, a Tailwind theme fragment, or W3C DTCG tokens. Colour and type
 * keep their bespoke namers; this covers the numeric ramps that all export the
 * same three ways.
 */

import type { ExportFormat } from "../components/ExportPanel/ExportPanel.js";

export type TokenType = "dimension" | "number";

export interface TokenEntry {
  /** Token name without prefix, e.g. "1", "sm" — the CSS var becomes --{group}-{name}. */
  name: string;
  /** Numeric value; rendered with `unit` for dimensions, bare for numbers. */
  value: number;
  /** Unit appended for dimension tokens (e.g. "rem", "px"). Ignored for numbers. */
  unit?: string;
}

export interface TokenGroup {
  /** CSS var prefix and Tailwind/DTCG group key, e.g. "space", "radius", "z". */
  group: string;
  type: TokenType;
  /** Tailwind theme key, e.g. "spacing", "borderRadius", "zIndex". */
  tailwindKey: string;
}

const render = (e: TokenEntry, type: TokenType): string =>
  type === "dimension" ? `${e.value}${e.unit ?? "rem"}` : `${e.value}`;

export function toCss(group: TokenGroup, entries: TokenEntry[]): string {
  const lines = entries.map((e) => `  --${group.group}-${e.name}: ${render(e, group.type)};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

export function toTailwind(group: TokenGroup, entries: TokenEntry[]): string {
  const rows = entries.map((e) => `      "${e.name}": "${render(e, group.type)}"`);
  return `export default {\n  theme: {\n    ${group.tailwindKey}: {\n${rows.join(",\n")},\n    },\n  },\n};`;
}

export function toDtcg(group: TokenGroup, entries: TokenEntry[]): string {
  const tokens: Record<string, { $type: string; $value: string | number }> = {};
  for (const e of entries) {
    tokens[e.name] = { $type: group.type, $value: render(e, group.type) };
  }
  return JSON.stringify({ [group.group]: tokens }, null, 2);
}

export function exportTokens(group: TokenGroup, entries: TokenEntry[], format: ExportFormat): string {
  if (format === "tailwind") return toTailwind(group, entries);
  if (format === "dtcg") return toDtcg(group, entries);
  return toCss(group, entries);
}

// ── String-valued tokens (shadow, gradient) ──────────────────────────────────

export interface StringTokenGroup {
  /** CSS var prefix and DTCG group key, e.g. "shadow". */
  group: string;
  /** W3C DTCG $type, e.g. "shadow". */
  dtcgType: string;
  /** Tailwind theme key, e.g. "boxShadow". */
  tailwindKey: string;
}

export interface StringTokenEntry {
  name: string;
  value: string;
}

export function exportStringTokens(
  group: StringTokenGroup,
  entries: StringTokenEntry[],
  format: ExportFormat,
): string {
  if (format === "tailwind") {
    const rows = entries.map((e) => `      "${e.name}": "${e.value}"`);
    return `export default {\n  theme: {\n    ${group.tailwindKey}: {\n${rows.join(",\n")},\n    },\n  },\n};`;
  }
  if (format === "dtcg") {
    const tokens: Record<string, { $type: string; $value: string }> = {};
    for (const e of entries) tokens[e.name] = { $type: group.dtcgType, $value: e.value };
    return JSON.stringify({ [group.group]: tokens }, null, 2);
  }
  const lines = entries.map((e) => `  --${group.group}-${e.name}: ${e.value};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
