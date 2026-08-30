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
