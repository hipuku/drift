/* One vocabulary for both sides. Every item is reduced to a string, so the
   diff is plain string equality.

   Item keys:
     token --drift-space-4   the token's value, resolved to the end
     component Button        "component"
     axis Button.variant     the axis's values, sorted, joined by |
     states Button           the compared states it styles, sorted, joined by |

   Tokens are compared resolved. Figma aliases a role to a primitive as the CSS
   does, but drift's accent ramp is computed in OKLCH from two numbers, which
   Figma holds as resolved colours, so both sides are followed to the value. */

import { COMPARED_STATES, PART_PAGES, isPrivateComponent } from "./config.mjs";

export const joinSet = (values) => [...new Set(values)].sort().join("|");

/** Three decimals: Figma stores floats in single precision (1.4 is
    1.399999976158142), so both sides are rounded the same way. */
export const round = (n) => String(Math.round(n * 1000) / 1000);

/** A font stack or an easing, with whitespace and quotes made uniform. */
export const normaliseString = (s) =>
  String(s)
    .replace(/\s+/g, " ")
    .replace(/'/g, '"')
    .replace(/\s*,\s*/g, ", ")
    .trim();

/** Axis names in Figma are written for people (`Variant`, `Label position`);
    in code they are props (`variant`, `labelPosition`). Compared without case
    or spaces, as haus's check does. */
export const axisName = (name) => name.split("#")[0].replace(/\s+/g, "").toLowerCase();

/** The CSS custom property a Figma variable stands for. */
export function variableToProperty(v) {
  const syntax = v.codeSyntax?.WEB?.match(/var\((--[\w-]+)\)/);
  return syntax ? syntax[1] : `--drift-${v.name.replace(/\//g, "-")}`;
}

/** Figma's value, in the units the code side reports: hex for colours, px for
    lengths, ms for durations, and opacity as a fraction (Figma holds 40 for
    0.4, since its opacity variables are percentages). */
function figmaValue(property, value) {
  if (value && typeof value === "object" && "hex" in value) return value.hex.toLowerCase();
  if (typeof value === "number")
    return round(property.startsWith("--drift-opacity-") ? value / 100 : value);
  return normaliseString(value);
}

/** Items from the exported Figma file. */
export function figmaItems(snapshot) {
  const items = {};
  const byProperty = Object.fromEntries(
    (snapshot.variables ?? []).map((v) => [variableToProperty(v), v]),
  );
  const resolve = (v, seen = new Set()) => {
    if (v.value && typeof v.value === "object" && "alias" in v.value) {
      const target = byProperty[v.value.alias];
      if (!target || seen.has(v.value.alias)) return `unresolved ${v.value.alias}`;
      seen.add(v.value.alias);
      return resolve(target, seen);
    }
    return figmaValue(variableToProperty(v), v.value);
  };
  for (const v of snapshot.variables ?? []) items[`token ${variableToProperty(v)}`] = resolve(v);

  for (const c of snapshot.components ?? []) {
    if (c.inSet || PART_PAGES.has(c.page) || isPrivateComponent(c.name)) continue;
    items[`component ${c.name}`] = "component";
    for (const p of c.props) {
      if (p.type !== "VARIANT") continue;
      const name = axisName(p.name);
      const options = p.options.map((o) => o.toLowerCase());
      if (name === "state") {
        const states = options.filter((o) => COMPARED_STATES.has(o));
        if (states.length) items[`states ${c.name}`] = joinSet(states);
        continue;
      }
      if (joinSet(options) === "false|true") continue;
      items[`axis ${c.name}.${name}`] = joinSet(options);
    }
  }
  return items;
}
