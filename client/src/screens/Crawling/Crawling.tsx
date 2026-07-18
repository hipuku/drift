/**
 * Crawl-in-progress screen.
 *
 * Pure presentation of live WebSocket progress: a bar and count, a running
 * element tally, and the pages landing one by one as the crawler reads them.
 * The socket/poll plumbing lives in useCrawlProgress; advancing to the audit on
 * completion lives in AuditFlow.
 */

import { Text } from "../../components/Text/Text.js";
import type { CrawlProgress } from "../../lib/api.js";
import type { CrawledPage } from "../../lib/useCrawlProgress.js";
import styles from "./Crawling.module.css";

interface CrawlingProps {
  host: string;
  progress: CrawlProgress | null;
  pages?: CrawledPage[];
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function Crawling({ host, progress, pages = [] }: CrawlingProps) {
  const done = progress?.pagesCrawled ?? 0;
  const total = progress?.maxPages ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 6;
  const elements = progress?.elementsTotal ?? 0;

  // Newest first, so freshly-read pages appear at the top.
  const recent = [...pages].reverse();

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <Text role="heading-lg" as="h1">
          Crawling {host}
        </Text>
        <Text role="body" as="p" className={styles.intro}>
          Drift is loading each page and reading the computed style of every element.
        </Text>

        <div
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={done}
          aria-label="Pages crawled"
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.meta}>
          <Text role="label-sm" className={styles.count}>
            {total > 0 ? `${done} of ${total} page${total === 1 ? "" : "s"}` : "Starting…"}
          </Text>
          {elements > 0 && (
            <Text role="mono" className={styles.elements}>
              {elements.toLocaleString()} elements read
            </Text>
          )}
        </div>

        {recent.length > 0 && (
          <ul className={styles.pageList}>
            {recent.map((p) => (
              <li key={p.url} className={styles.pageRow}>
                <span className={styles.dot} aria-hidden="true" />
                <Text role="mono" className={styles.pagePath}>
                  {pathOf(p.url)}
                </Text>
                {p.elements != null && (
                  <Text role="label-xs" className={styles.pageEls}>
                    {p.elements.toLocaleString()}
                  </Text>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
