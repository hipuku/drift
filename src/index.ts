/**
 * CLI for the crawler, used in isolation during this build step.
 *
 *   npm run crawl -- <url> [--pages N] [--out file.json]
 *
 * Prints the full CrawlResult as JSON to stdout (or a file with --out) and a
 * short human summary to stderr.
 */

import { writeFile } from "node:fs/promises";
import { crawl } from "./crawler/crawl.js";

interface Args {
  url: string;
  pages: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let pages = 1;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--pages") {
      pages = parseInt(argv[++i] ?? "", 10);
    } else if (arg === "--out") {
      out = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  const url = positional[0];
  if (!url) {
    throw new Error("Usage: npm run crawl -- <url> [--pages N] [--out file.json]");
  }
  return { url, pages: Number.isFinite(pages) ? pages : 1, out };
}

async function main() {
  const { url, pages, out } = parseArgs(process.argv.slice(2));

  process.stderr.write(`Crawling ${url} (up to ${pages} page${pages === 1 ? "" : "s"})...\n`);
  const result = await crawl(url, { maxPages: pages });

  const totalElements = result.pages.reduce((sum, p) => sum + p.elementCount, 0);
  process.stderr.write(
    `Done: ${result.pages.length} page(s), ${totalElements} element(s) extracted.\n`,
  );

  const json = JSON.stringify(result, null, 2);
  if (out) {
    await writeFile(out, json, "utf8");
    process.stderr.write(`Written to ${out}\n`);
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
