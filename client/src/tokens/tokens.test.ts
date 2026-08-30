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
