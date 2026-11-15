/**
 * Backend entry point.
 *
 * One long-lived process owning the HTTP API, the WebSocket progress server,
 * and the crawl worker. Fully deterministic. Where it listens, the optional API
 * token, the rate limit and the queue cap come from the environment
 * (access.ts, .env.example).
 *
 *   npm run dev:server
 */

import http from "node:http";
import { discoverPages } from "../crawler/discover.js";
import { BullCrawlJobs } from "../queue/crawlJobs.js";
import { createCrawlQueue } from "../queue/crawlQueue.js";
import { createCrawlWorker } from "../queue/crawlWorker.js";
import { createProgressServer } from "../realtime/wsServer.js";
import { accessConfig, isLoopbackHost, RateLimiter } from "./access.js";
import { createApp } from "./app.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

function main() {
  const queue = createCrawlQueue();
  const worker = createCrawlWorker();
  const jobs = new BullCrawlJobs(queue);

  const access = accessConfig(process.env);
  const app = createApp({
    jobs,
    discover: (url) => discoverPages(url),
    token: access.token,
    rateLimiter: access.ratePerMinute > 0 ? new RateLimiter(access.ratePerMinute, 60_000) : null,
    maxQueued: access.maxQueued,
  });
  const server = http.createServer(app);
  createProgressServer({ server, token: access.token }); // shares the HTTP server for WS upgrades

  server.listen(PORT, access.host, () => {
    process.stdout.write(`drift backend listening on ${access.host}:${PORT}\n`);
    if (!isLoopbackHost(access.host) && !access.token) {
      process.stdout.write(
        "  ! listening beyond loopback with no DRIFT_API_TOKEN: anyone who can reach this port can start crawls\n",
      );
    }
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
