import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every custom property a stylesheet reads must be defined somewhere.
 *
 * CSS fails silently here, which is what makes this worth a test. `var(--x)`
 * for an undefined `--x` is invalid at computed-value time: the declaration is
 * dropped and the property inherits. No console warning, no build error,
 * nothing in review. A misspelled colour looks like a theming decision and a
 * missing duration looks like a design choice — `--duration-default` (the scale
 * is fast / normal / moderate) sat in five animations making them instant.
 *
 * A fallback — `var(--x, 0.2s)` — is a real value, so it is not a failure. It
 * is still usually a sign the token name is wrong, since a fallback that never
 * loses is just a hardcoded value wearing a token's clothes.
 */

const SRC = resolve(process.cwd(), "src");

function filesUnder(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && extensions.some((x) => e.name.endsWith(x)))
    .map((e) => join(e.parentPath, e.name));
}

function matches(files: string[], pattern: RegExp): Set<string> {
  const found = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(pattern)) found.add(m[1]!);
  }
  return found;
}

describe("custom properties", () => {
  it("are all defined before they are read", () => {
    const css = filesUnder(SRC, [".css"]);

    // `var(--x)` only. `var(--x, fallback)` is excluded by the closing paren.
    const read = matches(css, /var\((--[a-z0-9-]+)\)/g);
    const definedInCss = matches(css, /^\s*(--[a-z0-9-]+)\s*:/gm);
    // Components set some properties inline, e.g. style={{ "--dur": "200ms" }}.
    const definedInTsx = matches(filesUnder(SRC, [".tsx", ".ts"]), /"(--[a-z0-9-]+)":/g);

    const undefined_ = [...read]
      .filter((name) => !definedInCss.has(name) && !definedInTsx.has(name))
      .sort();

    expect(undefined_).toEqual([]);
  });

  it("catches a property that is read but never defined", () => {
    // Proves the assertion above can fail — a guard whose matcher silently
    // stops matching passes forever and protects nothing.
    const read = new Set([...matches(filesUnder(SRC, [".css"]), /var\((--[a-z0-9-]+)\)/g), "--not-a-token"]);
    const defined = matches(filesUnder(SRC, [".css"]), /^\s*(--[a-z0-9-]+)\s*:/gm);

    expect([...read].filter((n) => !defined.has(n))).toContain("--not-a-token");
  });
});

/**
 * Components read semantics, never primitives (SIGNATURE §4).
 *
 * The rule was aspirational until the semantic tier covered spacing, radius,
 * elevation and motion; before that a component had nowhere else to go. Now it
 * does, so this holds the line: 196 spacing reads, 61 radius, 21 elevation and
 * 70 motion were migrated, and a new one should not appear without a decision.
 *
 * The exceptions are the type tier, which exists but is bypassed by bare
 * `font-size` and `font-family` declarations. Those are not a mechanical swap —
 * a type role carries size, weight, leading and tracking together, so adopting
 * one changes how the text sits, site by site. They are listed rather than
 * ignored: the list should only ever get shorter.
 */
const TYPE_TIER_DEBT = new Set([
  "--font-sans",
  "--font-mono",
  "--font-display",
  "--text-11",
  "--text-12",
  "--text-13",
  "--text-14",
  "--text-24",
  "--weight-medium",
  "--weight-semibold",
]);

describe("the two-tier rule", () => {
  it("keeps components off the primitives", () => {
    const primitives = matches(
      [resolve(SRC, "tokens/primitives.css")],
      /^\s*(--[a-z0-9-]+)\s*:/gm,
    );
    const read = matches(filesUnder(SRC, [".module.css"]), /var\((--[a-z0-9-]+)/g);

    const reaching = [...read].filter((n) => primitives.has(n) && !TYPE_TIER_DEBT.has(n)).sort();

    expect(reaching).toEqual([]);
  });

  it("keeps the recorded exceptions honest", () => {
    // A name that is no longer read, or no longer a primitive, should leave the
    // list — otherwise the debt looks larger than it is and stops being read.
    const primitives = matches(
      [resolve(SRC, "tokens/primitives.css")],
      /^\s*(--[a-z0-9-]+)\s*:/gm,
    );
    const read = matches(filesUnder(SRC, [".module.css"]), /var\((--[a-z0-9-]+)/g);

    const stale = [...TYPE_TIER_DEBT].filter((n) => !read.has(n) || !primitives.has(n)).sort();

    expect(stale).toEqual([]);
  });
});
