/**
 * Crawl job worker.
 *
 * Pulls crawl jobs off the queue, runs the Playwright crawler, and reports
 * progress per page via job.updateProgress. The worker owns no HTTP or socket
 * concerns; it is a process that turns queued jobs into CrawlResults.
 */

import { Worker, type Job } from "bullmq";
import { crawl } from "../crawler/crawl.js";
import { collectAudit } from "../analysis/audit.js";
import { deliver, type WebhookEvent } from "./webhook.js";
import type { CrawlResult } from "../crawler/types.js";
import { redisConnection } from "./connection.js";
import { CRAWL_QUEUE_NAME, type CrawlJobData, type CrawlProgress } from "./crawlQueue.js";

const DEFAULT_CONCURRENCY = 2;

export function createCrawlWorker(
  concurrency = DEFAULT_CONCURRENCY,
): Worker<CrawlJobData, CrawlResult> {
  return new Worker<CrawlJobData, CrawlResult>(
    CRAWL_QUEUE_NAME,
    async (job: Job<CrawlJobData>): Promise<CrawlResult> => {
      const { url, maxPages, pages, callbackUrl } = job.data;

      let elementsTotal = 0;
      // Delivery is best-effort and must never fail a crawl that succeeded.
      const notify = async (payload: WebhookEvent) => {
        if (callbackUrl) await deliver(callbackUrl, payload);
      };

      let result: CrawlResult;
      try {
        result = await crawl(url, {
        maxPages,
        pages,
        onPage: async (page, index) => {
          elementsTotal += page.elementCount;
          const progress: CrawlProgress = {
            pagesCrawled: index + 1,
            maxPages,
            lastUrl: page.url,
            lastTitle: page.title,
            lastElements: page.elementCount,
            elementsTotal,
          };
            await job.updateProgress(progress);
          },
        });

        // Reaching no pages is a failed crawl, not an empty one — the site was
        // unreachable, blocked us, or every selected page 404'd. Failing here
        // keeps the job status honest for anything reading the API directly.
        if (result.pages.length === 0) {
          throw new Error(
            "Couldn't read any pages — the site may be slow to load, blocking automated visits, or the selected pages may no longer exist.",
          );
        }
      } catch (err) {
        await notify({
          event: "crawl.failed",
          jobId: String(job.id),
          site: url,
          error: err instanceof Error ? err.message : "The crawl failed.",
        });
        throw err;
      }

      await notify({
        event: "crawl.completed",
        jobId: String(job.id),
        site: result.rootUrl,
        audit: collectAudit(result),
      });
      return result;
    },
    {
      connection: redisConnection(),
      concurrency,
      // A job whose worker died (e.g. OOM) is "stalled". Re-running it just
      // reproduces the crash, so fail it immediately rather than looping.
      maxStalledCount: 0,
    },
  );
}
