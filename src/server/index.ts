/**
 * Backend entry point.
 *
 * One long-lived process owning the HTTP API, the WebSocket progress server,
 * and the crawl worker. Fully deterministic — no API key required.
 *
 *   npm run dev
 */

import http from "node:http";
import { discoverPages } from "../crawler/discover.js";
import { BullCrawlJobs } from "../queue/crawlJobs.js";
import { createCrawlQueue } from "../queue/crawlQueue.js";
import { createCrawlWorker } from "../queue/crawlWorker.js";
import { createProgressServer } from "../realtime/wsServer.js";
import { createApp } from "./app.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

function main() {
  const queue = createCrawlQueue();
  const worker = createCrawlWorker();
  const jobs = new BullCrawlJobs(queue);

  const app = createApp({ jobs, discover: (url) => discoverPages(url) });
  const server = http.createServer(app);
  createProgressServer({ server }); // shares the HTTP server for WS upgrades

  server.listen(PORT, () => {
    process.stdout.write(`drift backend listening on :${PORT}\n`);
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
