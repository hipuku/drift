/* The Figma parity check.

     npm run figma:check                        compare, print, exit 1 if failing
     npm run figma:check -- --report out.md     also write the markdown report
     npm run figma:check -- --json out.json     also write the findings
     npm run figma:check -- --compact           known drift as a count (for pull requests)
     npm run figma:accept                       accept every current pair as the baseline
     npm run figma:accept -- "axis Button.variant"   accept one item
     npm run figma:check -- --refresh           save live components into the snapshot
     npm run figma:check -- --plugin-code       print the export code to run in Figma
     npm run figma:check -- --save out.json     store that code's result as the snapshot

   With FIGMA_TOKEN set, components are read live from the REST API; without it,
   from figma/snapshot. Variables always come from the snapshot (see rest.mjs).
   FIGMA_LATER=1 is the `figma-later` waiver. The rules are WORKFLOW.md § Figma. */

import fs from "node:fs";
import { FIGMA_FILE, PATHS } from "./config.mjs";
import { codeItems } from "./code.mjs";
import { figmaItems } from "./normalise.mjs";
import { diff, accept, applyExceptions } from "./diff.mjs";
import { report } from "./report.mjs";
import { FigmaUnavailable, fetchComponents, lastModified } from "./rest.mjs";
import { pluginCode } from "./plugin-export.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const token = flag("--offline") ? undefined : process.env.FIGMA_TOKEN;
const figmaLater = /^(1|true)$/i.test(process.env.FIGMA_LATER ?? "");

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {});
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");

function readSnapshot() {
  if (!fs.existsSync(PATHS.snapshot))
    throw new Error(
      `No snapshot at ${PATHS.snapshot}. Export it with the code from --plugin-code.`,
    );
  return readJson(PATHS.snapshot);
}

async function figmaSide() {
  const warnings = [];
  const snap = readSnapshot();
  let components = snap.components;
  let live = false;
  let variablesFresh = false;
  if (token) {
    try {
      const modified = await lastModified(FIGMA_FILE.key, token);
      variablesFresh = new Date(modified) <= new Date(snap.exportedAt);
      if (!variablesFresh)
        warnings.push(
          `The snapshot was exported ${snap.exportedAt} and the file changed ${modified}. ` +
            "Variables were compared against the snapshot; re-export it to compare the current file.",
        );
      const fetched = await fetchComponents(FIGMA_FILE.key, token);
      components = fetched.components;
      live = true;
      if (flag("--refresh"))
        writeJson(PATHS.snapshot, {
          ...snap,
          components,
          componentsReadAt: new Date().toISOString(),
        });
    } catch (e) {
      if (!(e instanceof FigmaUnavailable) || flag("--refresh")) throw e;
      const why = e.status ? `HTTP ${e.status}` : "unreachable";
      warnings.push(
        `Figma could not be read (${why}), so components were compared from the snapshot of ${snap.exportedAt.slice(0, 10)}.`,
      );
    }
  } else {
    warnings.push(
      `No FIGMA_TOKEN, so Figma was read from the committed snapshot (${snap.exportedAt.slice(0, 10)}).`,
    );
  }
  const source = live
    ? "the REST API for components, the snapshot for variables"
    : "the committed snapshot";
  return {
    items: figmaItems({ variables: snap.variables, components }),
    warnings,
    source,
    live,
    variablesFresh,
  };
}

async function main() {
  if (flag("--plugin-code")) {
    process.stdout.write(pluginCode());
    return;
  }
  if (flag("--save")) {
    const exported = readJson(option("--save"));
    writeJson(PATHS.snapshot, {
      // The capture time, not the save time: Figma may have changed in between.
      exportedAt: exported.capturedAt ?? new Date().toISOString(),
      source: "plugin",
      file: FIGMA_FILE,
      variables: exported.variables,
      components: exported.components.filter((c) => !c.inSet),
    });
    console.log(`Saved ${PATHS.snapshot}.`);
    return;
  }

  const exceptions = readJson(PATHS.exceptions).items ?? {};
  const side = await figmaSide();
  const { warnings, source, live, variablesFresh } = side;
  const { code, figma, baseline, stale } = applyExceptions({
    code: await codeItems(),
    figma: side.items,
    baseline: readJson(PATHS.baseline).items ?? {},
    exceptions,
  });
  for (const key of stale)
    warnings.push(
      `The exception for \`${key}\` is no longer needed: remove it from ${PATHS.exceptions}.`,
    );

  if (flag("--accept")) {
    const keys = args.filter((a) => !a.startsWith("--"));
    const items = accept({ code, figma, baseline, keys });
    writeJson(PATHS.baseline, { acceptedAt: new Date().toISOString(), items });
    console.log(
      `Baseline updated: ${keys.length ? keys.join(", ") : "every item"} (${Object.keys(items).length} items).`,
    );
    return;
  }

  const result = diff({ code, figma, baseline, figmaLater });
  const md = report({
    ...result,
    warnings,
    figmaLater,
    source,
    compact: flag("--compact"),
    exceptions: Object.keys(exceptions).length,
  });
  process.stdout.write(md);
  if (option("--report")) fs.writeFileSync(option("--report"), md);
  if (option("--json")) writeJson(option("--json"), { ...result, warnings, live, variablesFresh });
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (result.failing.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 2;
});
