/**
 * Backend entry point.
 *
 * One long-lived process owning the HTTP API, the WebSocket progress server,
 * (the audit service constructs a model client at startup).
 *
 *   npm run dev
 */

import http from "node:http";
import Redis from "ioredis";
import { discoverPages } from "../crawler/discover.js";
import { redisUrl } from "../queue/connection.js";
import { BullCrawlJobs } from "../queue/crawlJobs.js";
import { createCrawlQueue } from "../queue/crawlQueue.js";
import { createCrawlWorker } from "../queue/crawlWorker.js";
import { createProgressServer } from "../realtime/wsServer.js";
import { createApp } from "./app.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

// The agent needs an API key; discovery and crawling do not. Boot regardless —
// if the key is absent, only the audit endpoints fail (at call time).
function main() {
  const client = resolveAgentClient();

  const queue = createCrawlQueue();
  const worker = createCrawlWorker();
  const redis = new Redis(redisUrl(), { maxRetriesPerRequest: null });
  const jobs = new BullCrawlJobs(queue);
  const audit = new AuditService(client, redis, jobs);

  const app = createApp({ jobs, audit, redis, discover: (url) => discoverPages(url) });
  const server = http.createServer(app);
  createProgressServer({ server }); // shares the HTTP server for WS upgrades

  server.listen(PORT, () => {
    process.stdout.write(`drift backend listening on :${PORT}\n`);
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await redis.quit();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
