/**
 * BullMQ-backed crawl job access.
 *
 * Wraps the queue behind a narrow interface so the HTTP layer depends on a small
 * contract, not on BullMQ directly: CrawlJobs (enqueue + fetch result).
 */

import type { Queue } from "bullmq";
import type { CrawlResult } from "../crawler/types.js";
import { enqueueCrawl, type CrawlJobData } from "./crawlQueue.js";

export interface CrawlJobs {
  enqueue(data: CrawlJobData): Promise<string>;
  getResult(jobId: string): Promise<{ status: string; result?: CrawlResult; error?: string }>;
}

export class BullCrawlJobs implements CrawlJobs {
  constructor(private readonly queue: Queue<CrawlJobData>) {}

  async enqueue(data: CrawlJobData): Promise<string> {
    const job = await enqueueCrawl(this.queue, data);
    if (!job.id) throw new Error("queue did not assign a job id");
    return job.id;
  }

  async getResult(jobId: string): Promise<{ status: string; result?: CrawlResult; error?: string }> {
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: "not_found" };
    const status = await job.getState();
    if (status === "completed") {
      return { status, result: job.returnvalue as CrawlResult };
    }
    // Carry the worker's reason through: it says which of "unreachable",
    // "blocked", or "nothing there" actually happened.
    if (status === "failed" && job.failedReason) {
      return { status, error: job.failedReason };
    }
    return { status };
  }
}
