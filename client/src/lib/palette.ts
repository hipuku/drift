/**
 * Consolidated-palette export. Given the representative hex of each perceptual
 * cluster (usage-ranked), emit a clean palette as CSS custom properties,
 * Tailwind colours, or W3C DTCG tokens. Deterministic.
 */

export type ExportFormat = "css" | "tailwind" | "dtcg";

/** `color-1` is the most-used cluster, `color-2` next, and so on. */
const nameFor = (i: number): string => `color-${i + 1}`;

export function toCssVariables(hexes: string[]): string {
  const lines = hexes.map((hex, i) => `  --${nameFor(i)}: ${hex};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

export function toTailwind(hexes: string[]): string {
  const entries = hexes.map((hex, i) => `      "${i + 1}": "${hex}"`);
  return `export default {\n  theme: {\n    colors: {\n${entries.join(",\n")},\n    },\n  },\n};`;
}

export function toDtcg(hexes: string[]): string {
  const tokens: Record<string, { $type: string; $value: string }> = {};
  hexes.forEach((hex, i) => {
    tokens[nameFor(i)] = { $type: "color", $value: hex };
  });
  return JSON.stringify({ color: tokens }, null, 2);
}

export function exportPalette(hexes: string[], format: ExportFormat): string {
  if (format === "tailwind") return toTailwind(hexes);
  if (format === "dtcg") return toDtcg(hexes);
  return toCssVariables(hexes);
}
