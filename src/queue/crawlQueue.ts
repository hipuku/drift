/**
 * Crawl job queue.
 *
 * A crawl is slow and failure-prone, so it never runs on a request thread.
 * Submitting a crawl enqueues a job here and returns a job id immediately;
 * a worker (crawlWorker.ts) processes it and reports progress.
 */

import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export const CRAWL_QUEUE_NAME = "crawl";

/** Input for one crawl job. */
export interface CrawlJobData {
  url: string;
  maxPages: number;
  /** Exact pages to crawl (user selection / all). Absent → BFS from root. */
  pages?: string[];
}

/** Progress payload reported per page crawled. */
export interface CrawlProgress {
  pagesCrawled: number;
  maxPages: number;
  lastUrl: string;
  /** Title + element count of the page just crawled, and the running total. */
  lastTitle?: string;
  lastElements?: number;
  elementsTotal?: number;
}

export function createCrawlQueue(): Queue<CrawlJobData> {
  return new Queue<CrawlJobData>(CRAWL_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      // No retry. A crawl that fails by exhausting memory OOM-crashes the whole
      // worker process; BullMQ would then re-run the same heavy job on restart,
      // turning one crash into a poison-message loop. One attempt, no backoff.
      attempts: 1,
      // Keep recent results briefly; drop the rest to bound Redis memory.
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86_400 },
    },
  });
}

export async function enqueueCrawl(queue: Queue<CrawlJobData>, data: CrawlJobData) {
  return queue.add("crawl", data);
}
