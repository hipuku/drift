/**
 * Manual verification harness for the progress WebSocket server.
 *
 *   npm run realtime:demo
 *
 * Requires a running Redis. Starts the progress server, a crawl worker, and a
 * WebSocket client; enqueues a crawl; the client subscribes and logs every
 * message until the job completes; then everything shuts down.
 */

import { WebSocket } from "ws";
import { createCrawlQueue, enqueueCrawl } from "../queue/crawlQueue.js";
import { createCrawlWorker } from "../queue/crawlWorker.js";
import type { ServerMessage } from "./messages.js";
import { createProgressServer } from "./wsServer.js";

const PORT = 8787;
const url = process.argv[2] ?? "https://example.com";
const maxPages = Number.parseInt(process.argv[3] ?? "1", 10);

const server = createProgressServer({ port: PORT });
const worker = createCrawlWorker(1);
const queue = createCrawlQueue();

const job = await enqueueCrawl(queue, { url, maxPages });
const jobId = job.id!;
process.stdout.write(`enqueued job ${jobId}: ${url} (${maxPages} page${maxPages === 1 ? "" : "s"})\n`);

const client = new WebSocket(`ws://127.0.0.1:${PORT}`);

const finished = new Promise<void>((resolve) => {
  client.on("open", () => {
    client.send(JSON.stringify({ type: "subscribe", jobId }));
  });
  client.on("message", (raw) => {
    const m = JSON.parse(raw.toString()) as ServerMessage;
    if (m.type === "subscribed") process.stdout.write(`  ws <- subscribed ${m.jobId}\n`);
    else if (m.type === "progress")
      process.stdout.write(`  ws <- progress ${m.data.pagesCrawled}/${m.data.maxPages} ${m.data.lastUrl}\n`);
    else if (m.type === "completed") {
      process.stdout.write(`  ws <- completed ${m.jobId}\n`);
      resolve();
    } else if (m.type === "failed") {
      process.stdout.write(`  ws <- failed ${m.jobId}: ${m.reason}\n`);
      resolve();
    }
  });
});

await finished;
client.close();
await worker.close();
await queue.close();
await server.close();
process.exit(0);
