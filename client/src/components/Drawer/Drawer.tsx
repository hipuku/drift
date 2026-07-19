import { useEffect, type ReactNode } from "react";
import styles from "./Drawer.module.css";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Rendered in the sticky header, left of the close button. */
  title?: ReactNode;
  children: ReactNode;
}

/**
 * A bottom sheet — the detail surface for any token. Slides up over the content
 * (which stays put, no layout shift), scrolls when tall, and closes on Escape,
 * scrim click, or the close button.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grip} aria-hidden="true" />
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
