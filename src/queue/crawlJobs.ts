/**
 * BullMQ-backed crawl job access.
 *
 * Wraps the queue behind two narrow interfaces so the HTTP layer and the audit
 * service depend on small contracts, not on BullMQ directly: CrawlJobs (enqueue
 * + fetch result) for the API, and CrawlResultSource (the agent's input) for
 * the auditor. One adapter satisfies both.
 */

import type { Queue } from "bullmq";
import type { CrawlResultSource } from "../agent/auditService.js";
import type { CrawlResult } from "../crawler/types.js";
import { enqueueCrawl, type CrawlJobData } from "./crawlQueue.js";

export interface CrawlJobs {
  enqueue(data: CrawlJobData): Promise<string>;
  getResult(jobId: string): Promise<{ status: string; result?: CrawlResult }>;
}

export class BullCrawlJobs implements CrawlJobs, CrawlResultSource {
  constructor(private readonly queue: Queue<CrawlJobData>) {}

  async enqueue(data: CrawlJobData): Promise<string> {
    const job = await enqueueCrawl(this.queue, data);
    if (!job.id) throw new Error("queue did not assign a job id");
    return job.id;
  }

  async getResult(jobId: string): Promise<{ status: string; result?: CrawlResult }> {
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: "not_found" };
    const status = await job.getState();
    if (status === "completed") {
      return { status, result: job.returnvalue as CrawlResult };
    }
    return { status };
  }

  async getCrawlResult(jobId: string): Promise<CrawlResult | null> {
    const { result } = await this.getResult(jobId);
    return result ?? null;
  }
}
