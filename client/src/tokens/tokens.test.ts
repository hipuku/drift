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
 * missing duration looks like a design choice, `--duration-default` (the scale
 * is fast / normal / moderate) sat in five animations making them instant.
 *
 * A fallback, `var(--x, 0.2s)`, is a real value, so it is not a failure. It
 * is still usually a sign the token name is wrong, since a fallback that never
 * loses is just a hardcoded value wearing a token's clothes.
 *
 * Everything is read from `src` now. Until 2026-09-09 the foundation shipped in
 * haus-tokens and these assertions read the installed package as well; Drift is
 * independent and owns its tokens (tokens/foundation.css), so the source tree
 * is the whole of what loads.
 */

const SRC = resolve(process.cwd(), "src");
const FOUNDATION = resolve(SRC, "tokens/foundation.css");

function filesUnder(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && extensions.some((x) => e.name.endsWith(x)))
    .map((e) => join(e.parentPath, e.name));
}

function matches(files: string[], pattern: RegExp): Set<string> {
  return new Set(countMatches(files, pattern).keys());
}

/** As `matches`, but keeping how many times each name was read rather than
 *  only that it was. The type-tier ratchet below needs the count. */
function countMatches(files: string[], pattern: RegExp): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(pattern)) {
      found.set(m[1]!, (found.get(m[1]!) ?? 0) + 1);
    }
  }
  return found;
}

describe("custom properties", () => {
  it("finds the foundation it is meant to read", () => {
    // A wrong path here would make the assertions below pass by finding
    // nothing: every read would look defined against an empty set, or every
    // primitive would look absent. foundation.css is where the internalised
    // tokens live, so it must be substantial.
    const defined = matches([FOUNDATION], /^\s*(--[a-z0-9-]+)\s*:/gm);
    expect(defined.size, `no custom properties found in ${FOUNDATION}`).toBeGreaterThan(100);
  });

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
    // Proves the assertion above can fail, a guard whose matcher silently
    // stops matching passes forever and protects nothing.
    const css = filesUnder(SRC, [".css"]);
    const read = new Set([...matches(css, /var\((--[a-z0-9-]+)\)/g), "--not-a-token"]);
    const defined = matches(css, /^\s*(--[a-z0-9-]+)\s*:/gm);

    expect([...read].filter((n) => !defined.has(n))).toContain("--not-a-token");
  });
});

/**
 * Components read semantics, never primitives (SIGNATURE §4).
 *
 * The rule was aspirational until the semantic tier covered spacing, radius,
 * elevation and motion; before that a component had nowhere else to go. Now it
 * does, so this holds the line: a spacing, radius, elevation or motion read
 * lands on a role, and a new primitive read should not appear without a
 * decision.
 *
 * The exceptions are the type tier. They are counted rather than listed,
 * because a list of names ratchets on the wrong thing: a number per name is
 * what makes it a ratchet, so adding a read fails and removing one fails until
 * the number comes down with it.
 *
 * The split matters more than the total, and the totals are the two figures the
 * docs quote:
 *
 * **33 are `font-family`.** `--font-sans` sits on `<button>` and `<input>`,
 * which do not inherit a family from `body`, so the declaration is required
 * rather than lazy. `--font-mono` carries the tabular-data face.
 *
 * **9 are size, leading and tracking**, the specimen sheet's 11px labels, one
 * non-tabular mono size, and three deliberate departures from a role an element
 * is already on.
 *
 * The rule the type-tier work found is worth stating: **a role carries the
 * properties the thing actually chooses.** Prose chooses all four, which is why
 * the typeset roles bundle. Emphasis chooses weight alone, so
 * `--drift-weight-emphasis` and `--drift-weight-strong` carry nothing else. A
 * data cell chooses the face and the size and leaves leading to the row, so
 * `--drift-type-data-*` stops at two.
 */
const TYPE_TIER_DEBT = new Map([
  // Families, 33. --font-sans is on controls that do not inherit one.
  ['--font-sans', 22],
  ['--font-mono', 10],
  ['--font-display', 1],
  // Sizes, 6. Five are the dev harness; one is a single unit label.
  ['--drift-text-11', 5],
  ['--drift-text-14', 1],
  // Departures from a role the element is already on, 3.
  ['--drift-leading-relaxed', 1],
  ['--drift-leading-snug', 1],
  ['--drift-tracking-widest', 1],
]);

const FAMILIES = ["--font-sans", "--font-mono", "--font-display"];

/**
 * One decorative primitive read the role layer has no name for: the "partial"
 * hatch in the scalar sections alternates the primary role with a lighter
 * accent step to read as a stripe. Recorded rather than dressed up as a role,
 * and kept out of the type-tier ratchet because it is a colour, not a typeface.
 */
const DECORATIVE = new Set(["--drift-accent-300"]);

/**
 * What counts as a primitive here: any name declared in a `*.primitives`,
 * `*.brand` or `*.motion` cascade layer, less anything a `*.semantics` layer
 * declares. The layer a name is declared in is what decides its tier, so a
 * name Drift promotes to a role (border width, opacity, z-index) stops being a
 * primitive even though its value is a raw literal. Read from the cascade
 * layers directly, so the classification cannot drift from the CSS.
 */
function nameLayers(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let layer = "";
  const files = [
    FOUNDATION,
    resolve(SRC, "tokens/primitives.css"),
    resolve(SRC, "tokens/semantics.css"),
    resolve(SRC, "styles/drift.css"),
  ];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const lm = line.match(/@layer\s+([a-z0-9.]+)\s*\{/);
      if (lm) layer = lm[1]!;
      const dm = line.match(/^\s*(--[a-z0-9-]+)\s*:/);
      if (dm) out.set(dm[1]!, [...(out.get(dm[1]!) ?? []), layer]);
    }
  }
  return out;
}

function primitiveNames(): Set<string> {
  const layers = nameLayers();
  const prims = new Set<string>();
  for (const [name, ls] of layers) {
    const role = ls.some((l) => l.endsWith("semantics"));
    const prim = ls.some((l) => /(primitives|brand|motion)$/.test(l));
    if (prim && !role) prims.add(name);
  }
  return prims;
}

describe("the two-tier rule", () => {
  const read = () =>
    countMatches(filesUnder(SRC, [".module.css"]), /var\((--[a-z0-9-]+)/g);

  it("keeps components off the primitives", () => {
    const primitives = primitiveNames();
    const reaching = [...read().keys()]
      .filter((n) => primitives.has(n) && !TYPE_TIER_DEBT.has(n) && !DECORATIVE.has(n))
      .sort();

    expect(reaching).toEqual([]);
  });

  it("keeps the recorded exceptions honest", () => {
    // A name that is no longer read, or no longer a primitive, should leave the
    // list, otherwise the debt looks larger than it is and stops being read.
    const primitives = primitiveNames();
    const counts = read();

    const stale = [...TYPE_TIER_DEBT.keys()]
      .filter((n) => !counts.has(n) || !primitives.has(n))
      .sort();

    expect(stale).toEqual([]);
  });

  it("holds each exception at its recorded count", () => {
    // The ratchet. Equality in both directions: a read added fails, and a read
    // removed fails until the number comes down with it.
    const counts = read();
    const actual = Object.fromEntries(
      [...TYPE_TIER_DEBT.keys()].sort().map((n) => [n, counts.get(n) ?? 0]),
    );
    const recorded = Object.fromEntries(
      [...TYPE_TIER_DEBT.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );

    expect(actual).toEqual(recorded);
  });

  it("splits the total the way the docs quote it", () => {
    // DESIGN.md quotes these two figures. Asserting them here is what stops a
    // correction to one from leaving the other behind.
    const sum = (names: string[]) =>
      names.reduce((n, name) => n + (TYPE_TIER_DEBT.get(name) ?? 0), 0);
    const families = sum(FAMILIES);
    const scale = sum([...TYPE_TIER_DEBT.keys()].filter((n) => !FAMILIES.includes(n)));

    expect({ families, scale, total: families + scale }).toEqual({
      families: 33,
      scale: 9,
      total: 42,
    });
  });
});

/**
 * A CSS module's @keyframes must live in the file that names it.
 *
 * This is the custom-property failure one layer along, and it fails the same
 * silent way. CSS Modules hashes @keyframes names exactly as it hashes class
 * names, so `animation: slideTrack ...` in one module and `@keyframes
 * slideTrack` in another compile to two different identifiers. The declaration
 * parses, `animation-name` computes to precisely the string it was given, and
 * nothing runs.
 *
 * It is worth its own test because the two guards that should have caught it
 * could not. `tokens.test.ts` above reads custom properties, and a keyframes
 * name is not one. The computed-styles e2e re-resolves 2,680 elements, and
 * `animation-name` computes to the same string whether or not the keyframes
 * exist, so the diff is empty: the harness that proved the stylesheet split
 * safe was structurally blind to this.
 *
 * Found 2026-09-09, by looking at the screen. The stylesheet split moved
 * `.motionDot`, `.easingDot` and the colour card's flash into their own files
 * and left `slideTrack` and `cardFlash` behind in Audit.module.css. The motion
 * tab's dots had been still ever since, on a tab whose entire subject is the
 * durations a site animates with.
 *
 * That is three times a stylesheet-split defect has survived the checks:
 * drift#2's first attempt passed a guard that counted a class as defined if
 * `.name` appeared anywhere in the file, the revert was proved by unit tests
 * that never rendered the Badge, and this. Each guard tested the thing it was
 * built to test and the UI was broken anyway.
 */
describe("css module keyframes", () => {
  const modules = filesUnder(SRC, [".module.css"]);

  /** `animation: <name> ...` / `animation-name: <name>`, skipping the CSS-wide
   *  keywords and the shorthand's own timing and fill words. */
  const RESERVED = new Set([
    "none", "inherit", "initial", "unset", "revert", "revert-layer",
    "infinite", "alternate", "normal", "reverse", "forwards", "backwards",
    "both", "running", "paused", "linear", "ease", "ease-in", "ease-out",
    "ease-in-out", "step-start", "step-end",
  ]);

  function declaredIn(css: string): Set<string> {
    return new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!));
  }

  function namedIn(css: string): Set<string> {
    const out = new Set<string>();
    for (const m of css.matchAll(/\banimation(?:-name)?\s*:([^;]+);/g)) {
      for (const word of m[1]!.split(/[\s,]+/)) {
        // A bare identifier that is not a keyword, a time, a number, or a function.
        if (/^[a-zA-Z][\w-]*$/.test(word) && !RESERVED.has(word)) out.add(word);
      }
    }
    return out;
  }

  it.each(modules.map((f) => [f.slice(SRC.length + 1), f] as const))(
    "%s names only keyframes it defines",
    (_label, file) => {
      const css = readFileSync(file, "utf8");
      const declared = declaredIn(css);
      const dangling = [...namedIn(css)].filter((n) => !declared.has(n));
      expect(dangling, "keyframes named here but defined in another module").toEqual([]);
    },
  );

  /** The same helpers the check above runs on, against the real defect and its
   *  fix. A guard that has never been seen to fail is a guard on trust, and
   *  this repository has now shipped three of those. */
  const dangling = (css: string) => [...namedIn(css)].filter((n) => !declaredIn(css).has(n));

  it("catches a name whose keyframes live in another module", () => {
    const user = ".dot { animation: slideTrack 1s linear infinite alternate; }";
    const owner = "@keyframes slideTrack { from { left: 0; } to { left: 100%; } }";

    // Split across two modules, which is exactly what the stylesheet split did.
    expect(dangling(user)).toEqual(["slideTrack"]);
    // Together in one module, which is the fix.
    expect(dangling(user + owner)).toEqual([]);
  });

  it("does not mistake the shorthand's own keywords for a name", () => {
    const css = "@keyframes spin { to { rotate: 360deg; } }\n" +
      ".s { animation: spin 0.7s linear infinite alternate both; }\n" +
      ".t { animation: none; }\n" +
      ".u { animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; }";
    expect(dangling(css)).toEqual([]);
  });
});
