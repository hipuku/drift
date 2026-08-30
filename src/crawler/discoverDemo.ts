/**
 * Manual check for page discovery.
 *
 *   npm run discover -- https://example.com
 *
 * Loads the homepage, prints the same-origin pages it would offer for audit.
 */

import { discoverPages } from "./discover.js";

const url = process.argv[2] ?? "https://example.com";

const result = await discoverPages(url);
process.stdout.write(`${result.host}: ${result.pages.length} page(s)\n`);
for (const page of result.pages) {
  process.stdout.write(`  ${page.path.padEnd(28)} ${page.title}\n`);
}
process.exit(0);
