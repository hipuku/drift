/**
 * Recapture the bundled demo audit.
 *
 *   npm run capture -- <url> [--pages N] [--out file.json]
 *
 * The public build replays this capture, so a change to the analysis leaves it
 * showing the old analysis until someone recaptures. The capture's date is its
 * `capturedAt` field. This script is the crawler and the analysis without the
 * queue, Redis or the server.
 *
 * With no arguments it recaptures the demo's site at the demo's page count.
 */

import { writeFile } from "node:fs/promises";
import { collectAudit } from "./analysis/audit.js";
import { crawl } from "./crawler/crawl.js";

/** What the bundled demo was captured from. Changing these changes the demo. */
const DEMO_URL = "https://picocss.com/";
const DEMO_PAGES = 2;
const DEMO_OUT = "client/src/demo/audit.json";

interface Args {
  url: string;
  pages: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let pages = DEMO_PAGES;
  let out = DEMO_OUT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--pages") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(n) || n < 1) throw new Error("--pages needs a positive number.");
      pages = n;
    } else if (arg === "--out") {
      const next = argv[++i];
      if (!next) throw new Error("--out needs a path.");
      out = next;
    } else {
      positional.push(arg);
    }
  }
  return { url: positional[0] ?? DEMO_URL, pages, out };
}

async function main() {
  const { url, pages, out } = parseArgs(process.argv.slice(2));

  process.stderr.write(`Crawling ${url} (up to ${pages} page${pages === 1 ? "" : "s"})...\n`);
  const result = await crawl(url, { maxPages: pages });
  const audit = collectAudit(result);

  // `capturedAt` rides along with the audit so the demo banner and the case
  // study read the date off the artefact. It is not part of `SiteAudit`; the
  // API never returns it, and only this fixture carries it.
  const captured = new Date().toISOString().slice(0, 10);
  await writeFile(out, `${JSON.stringify({ ...audit, capturedAt: captured }, null, 2)}\n`, "utf8");

  // The figures the README and DESIGN.md quote, printed so the docs can be
  // reconciled against this run rather than against memory of the last one.
  const s = audit.summary;
  process.stderr.write(
    [
      ``,
      `Wrote ${out}, captured ${captured}`,
      ``,
      `The diagnosis, for the docs:`,
      `  ${s.contrastFailingAA ?? 0} of ${s.contrastPairs ?? 0} text/background pairs fail WCAG AA`,
      `  ${s.colourNearDuplicates} of ${s.distinctColours} colours are near-duplicates`,
      `  ${s.typeOffScale ?? 0} of ${s.typeSizes} type sizes fall off the scale`,
      `  ${s.spacingOffGrid ?? 0} of ${s.spacings} spacing values miss the 4px grid`,
      ``,
      `Also update: client/src/screens/Audit/Audit.test.tsx asserts against this file.`,
      ``,
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
