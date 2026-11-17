/* Variant axes and interaction states, read from a component's source.

   drift's components declare their props as `interface Props` or
   `interface <Name>Props`, with string unions in double quotes, either inline
   (`variant?: "primary" | "secondary"`) or through a type alias in the same file
   (`variant?: BadgeVariant`). Only string unions are axes: a boolean is a layer
   toggle as often as a prop in Figma, so it is not compared. */

import fs from "node:fs";

const union = (type) =>
  /^\s*\|?\s*(["'][^"']*["'])(\s*\|\s*["'][^"']*["'])+\s*$/.test(type)
    ? type
        .split("|")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : null;

/** String-union type aliases declared in the file, multi-line ones included. */
export function unionAliases(src) {
  const aliases = {};
  const joined = src.replace(/\n\s*\|/g, " |");
  for (const m of joined.matchAll(/^(?:export )?type (\w+)\s*=\s*([^;\n]+);?/gm)) {
    const values = union(m[2]);
    if (values) aliases[m[1]] = values;
  }
  return aliases;
}

/** Each prop of the component's own props interface whose type is a string union. */
export function axesOf(tsxPath, name) {
  const src = fs.readFileSync(tsxPath, "utf8");
  const m = src.match(new RegExp(`interface\\s+(?:${name})?Props[^{]*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!m) return {};
  const aliases = unionAliases(src);
  const axes = {};
  // A long union is wrapped by Prettier, one member a line: join each member
  // back onto its prop before reading it.
  const body = m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/:\s*\n\s*\|/g, ": ")
    .replace(/\n\s*\|/g, " |");
  for (const line of body.split("\n")) {
    const p = line.match(/^\s*(\w+)\??\s*:\s*(.+?);?\s*$/);
    if (!p) continue;
    const [, prop, type] = p;
    const values = union(type) ?? aliases[type.trim()];
    if (values) axes[prop] = values;
  }
  return axes;
}

/** Interaction states a stylesheet styles. A negation excludes rather than
    styles, so `:not(:disabled)` is dropped first. */
export function statesOf(cssPath) {
  if (!fs.existsSync(cssPath)) return [];
  const css = fs
    .readFileSync(cssPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/:not\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
  const found = new Set();
  for (const m of css.matchAll(/:(hover|active|disabled)\b/g)) found.add(m[1]);
  return [...found];
}
