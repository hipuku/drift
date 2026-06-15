/**
 * Manual verification harness for the crawl queue.
 *
 *   npm run queue:demo
 *
 * Requires a running Redis (REDIS_URL or localhost:6379). Enqueues one crawl,
 * runs a worker in the same process, logs progress and the final result, then
 * shuts down. Not a test — a way to exercise the real queue + worker loop.
 */

import { createCrawlQueue, enqueueCrawl, type CrawlProgress } from "./crawlQueue.js";
import { createCrawlWorker } from "./crawlWorker.js";

const url = process.argv[2] ?? "https://example.com";
const maxPages = Number.parseInt(process.argv[3] ?? "1", 10);

const queue = createCrawlQueue();
const worker = createCrawlWorker(1);

worker.on("progress", (_job, progress) => {
  const p = progress as CrawlProgress;
  process.stdout.write(`  progress: ${p.pagesCrawled}/${p.maxPages} — ${p.lastUrl}\n`);
});

const finished = new Promise<void>((resolve) => {
  worker.on("completed", (_job, result) => {
    const elements = result.pages.reduce((sum, p) => sum + p.elementCount, 0);
    process.stdout.write(`  completed: ${result.pages.length} page(s), ${elements} element(s)\n`);
    resolve();
  });
  worker.on("failed", (_job, err) => {
    process.stderr.write(`  failed: ${err?.message ?? "unknown error"}\n`);
    resolve();
  });
});

const job = await enqueueCrawl(queue, { url, maxPages });
process.stdout.write(`enqueued job ${job.id}: ${url} (${maxPages} page${maxPages === 1 ? "" : "s"})\n`);

await finished;
await worker.close();
await queue.close();
process.exit(0);
