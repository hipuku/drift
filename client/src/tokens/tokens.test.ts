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
const HAUS_PRIMITIVES = ["primitives.css", "brand.css", "motion.css"].map((f) => join(HAUS_TOKENS, f));
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
 * ratchet: adding a read fails, removing one fails until the number comes
 * down with it.
 *
 * The split matters more than the total, and the totals are the two figures
 * the docs quote:
 *
 * **30 are `font-family`.** Twenty are `--font-sans` on `<button>` and
 * `<input>`, which do not inherit a family from `body`, so the declaration is
 * required rather than lazy. That was true of 42 of them until drift#24, when
 * twelve `--font-mono` reads became `--type-data-family`.
 *
 * Which corrects something this comment used to assert. *"No type role carries
 * a family"* was true when it was written and is not now: `--type-data-*` does,
 * because mono is not a decoration on tabular data, it is the decision.
 *
 * **9 are size, leading and tracking**, from 43 (drift#1) through 28 (drift#26)
 * and 21 (drift#25) to 9 (drift#24), all on 2026-09-05.
 *
 * The four issues found one rule between them, and it is worth stating rather
 * than leaving in four commit messages: **a role carries the properties the
 * thing actually chooses.** Prose chooses all four, which is why the eleven
 * typeset roles bundle. Emphasis chooses weight alone, so `--haus-weight-emphasis`
 * and `--haus-weight-strong` carry nothing else. A data cell chooses the face and
 * the size and leaves leading to the row, so `--type-data-*` stops at two.
 * Roles that carry more than the decision force call sites to override them,
 * and every override is a primitive read waiting to happen.
 *
 * **What is left is nine, in three groups, and none of it is a backlog:**
 *
 * - **5 in `Foundation.module.css`**, which renders only under `DevHarness`. It
 *   is the token specimen sheet, not a product screen, and 11px mono is how it
 *   labels its own swatches. A role exists to be reused by the product; giving
 *   one to a development tool would put the tool inside the contract.
 * - **1 `--haus-text-14`**, `.unitVal`: the one mono size on the audit screen that is
 *   not tabular, sized to sit beside body text rather than inside a column. One
 *   occurrence is a departure, not a role.
 * - **3 departures** from a role the element is already on: `.pill` wants 1.5
 *   leading where label-sm carries 1.4, `.healthLine` 1.25 where heading-lg
 *   carries 1.2, `.healthKicker` 0.08em tracking because it is uppercase where
 *   label-sm carries 0.02em. Reading a primitive is what a departure *is*.
 *
 * Nothing here is waiting on a decision any more.
 */
const TYPE_TIER_DEBT = new Map([
  // Families, 30. --font-sans is on controls that do not inherit one.
  ['--font-sans', 20],
  ['--font-mono', 9],
  ['--font-display', 1],
  // Sizes, 6. Five are the dev harness; one is a single unit label.
  ['--haus-text-11', 5],
  ['--haus-text-14', 1],
  // Departures from a role the element is already on, 3.
  ['--haus-leading-relaxed', 1],
  ['--haus-leading-snug', 1],
  ['--haus-tracking-widest', 1],
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
    // stale, which is the failure this replaced: the total moved from 94 to 89
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
      families: 30,
      scale: 9,
      total: 39,
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

    // A component's own internal properties are defined by the component, on
    // its own class rather than at :root, and they are not roles Drift is being
    // asked to supply. --haus-btn-solid is Button's remap of a tone; nothing
    // outside Button should set it. So they are matched anywhere in the
    // stylesheet, not only at the start of a line, and subtracted from what is
    // read. Twenty-four of them arrived with the six overlay components in
    // haus 1.0, which is why this list was empty until the upgrade.
    const selfDefined = matches([HAUS_COMPONENTS_CSS], /(--[a-z0-9-]+)\s*:/g);
    const read = matches([HAUS_COMPONENTS_CSS], /var\((--[a-z0-9-]+)\)/g);

    const undefined_ = [...read]
      .filter((name) => !defined.has(name) && !selfDefined.has(name))
      .sort();

    expect(undefined_).toEqual([]);
  });
});
