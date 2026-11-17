/* The code side of the parity check: drift's tokens, resolved by a browser, and
   its five components' variant axes and states.

   Tokens are resolved in a headless Chromium rather than parsed here, because
   their values are the cascade's: seven layers decide which declaration wins,
   and the accent ramp is oklch() over calc() over two other tokens. The
   browser applies all of it and reports each token's value. Colours come back
   through relative colour syntax as sRGB floats, rounded to hex the way
   Figma's export rounds; lengths come back in px, durations in ms. */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CSS_STATES, PATHS, VARIABLE_CATEGORIES } from "./config.mjs";
import { joinSet, normaliseString, round } from "./normalise.mjs";
import { axesOf, statesOf } from "./variants.mjs";

/** Every --drift-* property the token stylesheets declare, in a compared category. */
export function declaredTokens(css) {
  const names = new Set();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--drift-[\w-]+)\s*:/g)) {
    const category = m[1].slice("--drift-".length).split("-")[0];
    if (VARIABLE_CATEGORIES.has(category)) names.add(m[1]);
  }
  return [...names].sort();
}

/* Runs in the page: each token's value, in Figma's units. */
function resolveInPage(names) {
  const root = getComputedStyle(document.documentElement);
  const probe = document.getElementById("probe");
  const hex = (x) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, "0");
  const out = {};
  for (const name of names) {
    const v = root.getPropertyValue(name).trim();
    let r;
    if (/^-?[\d.]+$/.test(v)) r = { num: Number(v) };
    else if (/^-?[\d.]+m?s$/.test(v))
      r = { num: v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000 };
    else if (/^-?[\d.]+em$/.test(v)) r = { num: parseFloat(v) };
    else if (CSS.supports("color", v)) {
      probe.style.color = `color(from ${v} srgb r g b / alpha)`;
      const m = getComputedStyle(probe).color.match(
        /color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([-\d.e]+))?\)/,
      );
      probe.style.color = "";
      if (m) {
        const a = m[4] === undefined ? 1 : Number(m[4]);
        r = { str: `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}${a < 1 ? hex(a) : ""}` };
      } else r = { str: v };
    } else if (CSS.supports("margin-left", v)) {
      probe.style.marginLeft = v;
      r = { num: parseFloat(getComputedStyle(probe).marginLeft) };
      probe.style.marginLeft = "";
    } else r = { str: v };
    out[name] = r;
  }
  return out;
}

/** Each compared token's value, as the browser resolves drift's stylesheets. */
export async function codeTokens(root = ".") {
  const css = PATHS.tokens.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  const names = declaredTokens(css);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style><div id="probe"></div>`);
    const resolved = await page.evaluate(resolveInPage, names);
    const items = {};
    for (const name of names) {
      const r = resolved[name];
      items[`token ${name}`] = "num" in r ? round(r.num) : normaliseString(r.str);
    }
    return items;
  } finally {
    await browser.close();
  }
}

/** Every component folder, with its variant axes and the compared states it styles. */
export function codeComponents(root = ".") {
  const items = {};
  const dir = path.join(root, PATHS.components);
  for (const name of fs.readdirSync(dir).sort()) {
    const tsx = path.join(dir, name, `${name}.tsx`);
    if (!fs.existsSync(tsx)) continue;
    items[`component ${name}`] = "component";
    for (const [prop, values] of Object.entries(axesOf(tsx, name)))
      items[`axis ${name}.${prop.toLowerCase()}`] = joinSet(values);
    const states = statesOf(path.join(dir, name, `${name}.module.css`))
      .map((s) => CSS_STATES[s])
      .filter(Boolean);
    if (states.length) items[`states ${name}`] = joinSet(states);
  }
  return items;
}

export const codeItems = async (root = ".") => ({
  ...(await codeTokens(root)),
  ...codeComponents(root),
});
