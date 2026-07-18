import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { Text } from "../components/Text/Text.js";
import { ThemeControls } from "./ThemeControls.js";
import styles from "./ProductShell.module.css";

interface ProductShellProps {
  children: ReactNode;
  /** Brand click → start a new audit. */
  onHome?: () => void;
  /** Dev-only slot rendered after the product links (e.g. the harness opener). */
  trailing?: ReactNode;
}

/**
 * The product's top-level chrome. Drift is a single-task tool, so navigation is
 * a slim top bar — brand left (→ new audit), quiet links right. Per-task actions
 * (export, share) live inside the relevant state, not here.
 */
export function ProductShell({ children, onHome, trailing }: ProductShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <button type="button" className={styles.brand} onClick={onHome} aria-label="New audit">
          <Text role="heading" as="span">
            drift
          </Text>
        </button>
        <div className={styles.actions}>
          <a
            className={styles.iconLink}
            href="https://github.com/hipuku/drift"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
          >
            <FontAwesomeIcon icon={faGithub} />
          </a>
          <a
            className={styles.iconLink}
            href="https://hipuku.dev"
            target="_blank"
            rel="noreferrer"
            aria-label="hipuku.dev"
          >
            <FontAwesomeIcon icon={faGlobe} />
          </a>
          <ThemeControls />
          {trailing}
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
