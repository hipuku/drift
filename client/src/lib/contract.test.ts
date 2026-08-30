import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INDISTINGUISHABLE_DELTA_E } from "../screens/Audit/auditModel.js";

/**
 * Guards the values this client mirrors from the service.
 *
 * The client is a standalone package with its own lockfile and its own
 * dependency graph — `lib/api.ts` restates the wire types by hand rather than
 * importing them, and that is deliberate: the service pulls in Playwright,
 * BullMQ and Redis, none of which belong in a browser bundle. The cost of that
 * choice is that a value living on both sides can move on one and nothing
 * notices, which is exactly what INDISTINGUISHABLE_DELTA_E was doing.
 *
 * So the service's source is read as text and its declared literal compared.
 * Reading rather than importing is the point: importing `analysis/colours.ts`
 * would pull haus-colour-utils into the client's build, which is the coupling
 * the mirror exists to avoid.
 *
 * If this fails, the two sides disagree. Change both, or neither.
 */

/** Resolved from the package root — vitest runs with cwd at client/, and under
 *  jsdom `import.meta.url` is not a file URL. */
const SERVICE_COLOURS = resolve(process.cwd(), "../src/analysis/colours.ts");
const SERVICE_AUDIT = resolve(process.cwd(), "../src/analysis/audit.ts");
const CLIENT_API = resolve(process.cwd(), "src/lib/api.ts");

/**
 * Pull an exported number literal out of the service source. Throws rather than
 * returning null, so a rename or a refactor fails this loudly instead of
 * quietly matching nothing and passing — a guard that can silently stop
 * guarding is worse than no guard.
 */
function declaredConstant(name: string): number {
  const source = readFileSync(SERVICE_COLOURS, "utf8");
  const match = new RegExp(`export const ${name} = (-?[\\d.]+);`).exec(source);
  if (!match?.[1]) {
    throw new Error(
      `Could not find 'export const ${name}' in ${SERVICE_COLOURS}. ` +
        "It was renamed, moved, or is no longer a plain number — update this guard.",
    );
  }
  return Number(match[1]);
}

describe("the values this client mirrors from the service", () => {
  it("agrees with the service on INDISTINGUISHABLE_DELTA_E", () => {
    expect(INDISTINGUISHABLE_DELTA_E).toBe(declaredConstant("INDISTINGUISHABLE_DELTA_E"));
  });

  it("fails loudly when the service constant can no longer be found", () => {
    expect(() => declaredConstant("NO_SUCH_CONSTANT")).toThrow(/Could not find/);
  });
});

/**
 * Field optionality has to match too, and that is the half this file was
 * missing.
 *
 * A mirrored type that says `tags?` where the service always sends `tags` costs
 * every consumer a branch it does not need — the reason B1 made these required
 * on the service. The client was not updated, and the cost was not theoretical:
 * both of the repo's lint warnings traced to it, because `sw.elements ?? []`
 * builds a new array on every render and defeats the memo below it. Five fields
 * had drifted by the time anyone noticed, and nothing failed.
 *
 * Names, not structures. This compares the optionality of field names the two
 * files share, which is coarse — it cannot see that a field moved interfaces —
 * but it catches the drift that actually happens, which is a field going
 * optional on one side and staying required on the other.
 */

/** Field names declared optional (`name?:`) and required (`name:`) in a source. */
function fieldOptionality(file: string): { optional: Set<string>; required: Set<string> } {
  const source = readFileSync(file, "utf8");
  const optional = new Set<string>();
  const required = new Set<string>();
  for (const m of source.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)(\??):/gm)) {
    (m[2] === "?" ? optional : required).add(m[1]!);
  }
  return { optional, required };
}

describe("the wire types this client mirrors", () => {
  const service = fieldOptionality(SERVICE_AUDIT);
  const client = fieldOptionality(CLIENT_API);

  it("finds fields on both sides to compare", () => {
    // If a rename or a restructure leaves nothing shared, every assertion below
    // passes vacuously and the guard silently stops guarding.
    const shared = [...service.optional, ...service.required].filter(
      (n) => client.optional.has(n) || client.required.has(n),
    );
    expect(shared.length).toBeGreaterThan(20);
  });

  it("does not declare optional what the service always sends", () => {
    const lying = [...client.optional]
      .filter((n) => service.required.has(n) && !service.optional.has(n))
      .sort();

    expect(lying).toEqual([]);
  });

  it("does not declare required what the service may omit", () => {
    // The costlier direction: the client renders a field the payload lacks.
    const overclaimed = [...client.required]
      .filter((n) => service.optional.has(n) && !service.required.has(n))
      .sort();

    expect(overclaimed).toEqual([]);
  });
});
