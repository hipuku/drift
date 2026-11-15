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

/** How long a shutdown waits for the worker and the queue to close. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

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

  // Close the worker and the queue, then the server, and exit. With Redis
  // unreachable, BullMQ's close never settles, so it gets SHUTDOWN_TIMEOUT_MS;
  // past that, or on an error, the failure is reported and the process still
  // stops with a failing code, rather than hanging on a signal.
  const shutdown = async (signal: string) => {
    let code = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer from Redis after ${SHUTDOWN_TIMEOUT_MS / 1000}s`)),
        SHUTDOWN_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([Promise.all([worker.close(), queue.close()]), timeout]);
    } catch (err) {
      process.stderr.write(
        `  ! ${signal}: the queue did not close cleanly: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      code = 1;
    } finally {
      clearTimeout(timer);
      server.close();
      process.exit(code);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main();
