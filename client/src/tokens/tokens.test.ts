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
 */

const SRC = resolve(process.cwd(), "src");

/**
 * The primitive, motion and semantic layers ship in haus-tokens, so the
 * assertions below have to read the package as well as the source tree. Reading
 * the installed copy rather than a vendored one is the point: if the package
 * moves a value, this sees the value that will actually load.
 *
 * The two are kept apart because the tier rule further down needs to know which
 * of the package's names are primitives and which are roles.
 */
const HAUS_TOKENS = resolve(process.cwd(), "node_modules/haus-tokens/dist");
const HAUS_PRIMITIVES = ["primitives.css", "motion.css"].map((f) => join(HAUS_TOKENS, f));
const HAUS_SEMANTICS = join(HAUS_TOKENS, "semantics.css");
const HAUS_CSS = [...HAUS_PRIMITIVES, HAUS_SEMANTICS];

/**
 * haus-components ships its stylesheet as a file rather than injecting it, so
 * the roles it reads can be checked the same way the source tree's are.
 */
const HAUS_COMPONENTS_CSS = resolve(
  process.cwd(),
  "node_modules/haus-components/dist/styles.css",
);

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
  it("finds the package it is meant to read", () => {
    // A wrong path here would make both assertions below pass by finding
    // nothing: every primitive would look undefined, and no component would
    // look like it was reaching for one.
    const defined = matches(HAUS_PRIMITIVES, /^\s*(--[a-z0-9-]+)\s*:/gm);
    expect(defined.size, `no custom properties found under ${HAUS_TOKENS}`).toBeGreaterThan(100);
  });

  it("are all defined before they are read", () => {
    const css = [...filesUnder(SRC, [".css"]), ...HAUS_CSS];

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
    const css = [...filesUnder(SRC, [".css"]), ...HAUS_CSS];
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
 * does, so this holds the line: 196 spacing reads, 61 radius, 21 elevation and
 * 70 motion were migrated, and a new one should not appear without a decision.
 *
 * The exceptions are the type tier. They are counted rather than listed,
 * because a list of names ratchets on the wrong thing: every name below was
 * already on it when the total was 94 and when it was 89, so the debt changed
 * twice and nothing here could tell. A number per name is what makes it a
 * ratchet — adding a read fails, removing one fails until the number comes
 * down with it.
 *
 * The split matters more than the total, and the totals are the two figures
 * the docs quote:
 *
 * **42 are `font-family`, and are not debt at all.** No type role carries a
 * family — the eleven roles set size, weight, leading and tracking, and
 * `--type-mono-*` is no exception. A family therefore has no role to adopt,
 * and most of these sit on `<button>` and `<input>`, which do not inherit one.
 * They are counted here because they read a primitive and the rule is about
 * primitives, not because there is anything to fix.
 *
 * **21 are size, leading and tracking**, from 43 (drift#1) via 28 (drift#26)
 * to 21 (drift#25), all on 2026-09-05. There is no longer a single weight read
 * in the components, and that is the interesting half.
 *
 * **Weight left entirely, and not by converting anything.** Five reads —
 * a `<strong>` inside body copy, a count inside a sentence, a 13px control and
 * a 13px text button — all wanted the same thing: text that keeps its parent's
 * size and leading and is heavier. No typeset role can serve that, structurally
 * rather than by omission, because adopting one would resize the word being
 * emphasised. So `semantics.css` gained two weight-only roles, `--weight-emphasis`
 * and `--weight-strong`, in the shape `--radius-control: var(--radius-md)`
 * already uses: the role says why, the primitive says what. drift#25.
 *
 * **What is left is 18 mono and 3 departures.**
 *
 * - **18 mono** at 11px, 12px and 14px. The only mono role is `--type-mono` at
 *   13px with `leading-loose`. The audit screen's token tables are 12px so
 *   eighty properties fit without scrolling, and adopting the role would change
 *   the size *and* the line height of every table on it. drift#24.
 * - **3 departures** from a role the element is already on: `.pill` wants 1.5
 *   leading where label-sm carries 1.4, `.healthLine` wants 1.25 where
 *   heading-lg carries 1.2, `.healthKicker` is uppercase and wants 0.08em
 *   tracking where label-sm carries 0.02em. Reading a primitive is what a
 *   departure *is*; reading another role's property would be mixing roles,
 *   which the semantics header forbids. Each says so at the call site.
 *
 * Two more declarations left by being deleted rather than converted: `.title`
 * and `.healthLine` each carried a `letter-spacing` that re-stated the tracking
 * of the role the element already rendered with. They did nothing at all.
 *
 * The next move on any of it is a decision about the scale, not a refactor.
 */
const TYPE_TIER_DEBT = new Map([
  // Families. No role carries one; nothing to adopt.
  ['--font-sans', 20],
  ['--font-mono', 21],
  ['--font-display', 1],
  // Sizes. 43 before drift#1, and all 21 that are left are mono.
  ['--text-11', 5],
  ['--text-12', 12],
  ['--text-14', 1],
  // Departures from a role the element is already on. Three, each on one
  // element, each with the reason at the call site.
  ['--leading-relaxed', 1],
  ['--leading-snug', 1],
  ['--tracking-widest', 1],
]);

const FAMILIES = ["--font-sans", "--font-mono", "--font-display"];

/**
 * What counts as a primitive here: haus-tokens' two layers plus Drift's
 * overrides, less anything Drift's own semantic layer declares.
 *
 * That subtraction is the interesting part. haus classes border width, opacity
 * and z-index as primitives; Drift declares them as roles in semantics.css.
 * Both are defensible, and the file that declares a name in this tree is the
 * one that decides what tier it is in. Without the subtraction, adopting the
 * package would make six roles Drift has always had look like reaches.
 */
function primitiveNames(): Set<string> {
  const all = matches(
    [resolve(SRC, "tokens/primitives.css"), ...HAUS_PRIMITIVES],
    /^\s*(--[a-z0-9-]+)\s*:/gm,
  );
  const roles = matches(
    [resolve(SRC, "tokens/semantics.css"), HAUS_SEMANTICS],
    /^\s*(--[a-z0-9-]+)\s*:/gm,
  );
  return new Set([...all].filter((name) => !roles.has(name)));
}

describe("the two-tier rule", () => {
  const read = () =>
    countMatches(filesUnder(SRC, [".module.css"]), /var\((--[a-z0-9-]+)/g);

  it("keeps components off the primitives", () => {
    const primitives = primitiveNames();
    const reaching = [...read().keys()]
      .filter((n) => primitives.has(n) && !TYPE_TIER_DEBT.has(n))
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
    // The ratchet. Equality rather than an upper bound, in both directions: a
    // read added fails, and a read removed fails until the number comes down
    // with it. An upper bound would let the figures the docs quote go quietly
    // stale, which is the failure this replaced — the total moved from 94 to 89
    // with every name still on the list and nothing to notice.
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
    // DESIGN.md and issue #1 both quote these two figures. Asserting them here
    // is what stops a correction to one from leaving the other behind.
    const sum = (names: string[]) =>
      names.reduce((n, name) => n + (TYPE_TIER_DEBT.get(name) ?? 0), 0);
    const families = sum(FAMILIES);
    const scale = sum([...TYPE_TIER_DEBT.keys()].filter((n) => !FAMILIES.includes(n)));

    expect({ families, scale, total: families + scale }).toEqual({
      families: 42,
      scale: 21,
      total: 63,
    });
  });
});

/**
 * haus-components reads roles from haus-tokens' semantic layer, and Drift loads
 * that layer for it. This holds the two together.
 *
 * Without it the failure is silent and arrives later: a release of the package
 * reads a role Drift has never loaded, the declaration is dropped at computed
 * value time, and a focus ring or a shadow is simply absent. The version that
 * introduced it would pass every check Drift has.
 *
 * Five roles were undefined here before the semantic layer was imported:
 * --color-ink-on-aronia, --elevation-floating, --motion-duration-emphasis,
 * --radius-marker and --shadow-focus-error. Declaring five lines locally was
 * the alternative, and it is the same hand-copy this file already exists to
 * prevent.
 *
 * A reference with a fallback is excluded, as above. Avatar sets --avatar-bg
 * and --avatar-fg inline and reads them as `var(--avatar-bg, ...)`, which is a
 * real value whether or not the property is set.
 */
describe("haus-components", () => {
  it("finds the stylesheet it is meant to read", () => {
    const source = readFileSync(HAUS_COMPONENTS_CSS, "utf8");
    expect(source.length, `empty stylesheet at ${HAUS_COMPONENTS_CSS}`).toBeGreaterThan(1000);
  });

  it("reads no role Drift does not load", () => {
    const loaded = [
      ...HAUS_CSS,
      resolve(SRC, "tokens/primitives.css"),
      resolve(SRC, "tokens/semantics.css"),
      ...filesUnder(resolve(SRC, "styles"), [".css"]),
    ];
    const defined = matches(loaded, /^\s*(--[a-z0-9-]+)\s*:/gm);
    const read = matches([HAUS_COMPONENTS_CSS], /var\((--[a-z0-9-]+)\)/g);

    const undefined_ = [...read].filter((name) => !defined.has(name)).sort();

    expect(undefined_).toEqual([]);
  });
});
