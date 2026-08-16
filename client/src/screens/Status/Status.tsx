/**
 * Shared interstitials: the working spinner and the terminal error card.
 * Small, presentational, used by AuditFlow between the substantive screens.
 */

import { Button } from "../../components/Button/Button.js";
import { Callout } from "../../components/Callout/Callout.js";
import { Text } from "../../components/Text/Text.js";
import styles from "./Status.module.css";

interface ThinkingProps {
  title: string;
  detail: string;
}

/** Indeterminate "working" state — shown while the crawl/aggregation runs. */
export function Thinking({ title, detail }: ThinkingProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.spinner} aria-hidden="true" />
          <Text role="heading-lg" as="h1">
            {title}
          </Text>
        </div>
        <Text role="body" as="p" className={styles.detail}>
          {detail}
        </Text>
      </div>
    </div>
  );
}

interface FailedProps {
  message: string;
  onRetry: () => void;
}

/** Terminal failure for the whole run, with a path back to a new audit. */
export function Failed({ message, onRetry }: FailedProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <Text role="heading-lg" as="h1">
          Audit stopped
        </Text>
        <div className={styles.callout}>
          <Callout variant="error">{message}</Callout>
        </div>
        <Button variant="primary" fullWidth onClick={onRetry}>
          Start over
        </Button>
      </div>
    </div>
  );
}
