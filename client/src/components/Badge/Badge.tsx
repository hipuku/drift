/**
 * Badge — the one pill used across the app. Before this, the audit, hub, and
 * every proposal hand-rolled their own pills with drifting colours, radii, and
 * weights. This is the canonical shape (matching the audit's token pills):
 * pill-radius, 12px, with semantic variants for the meaning being conveyed.
 */

import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "info" | "warning" | "danger";

interface Props {
  children: ReactNode;
  /** Semantic tone. neutral = fact, info = a proposed change, warning/danger = drift. */
  variant?: BadgeVariant;
  /** Use a monospace face for numeric/value badges (e.g. "→ 4px"). */
  mono?: boolean;
  className?: string;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: styles.neutral!,
  info: styles.info!,
  warning: styles.warning!,
  danger: styles.danger!,
};

export function Badge({ children, variant = "neutral", mono = false, className }: Props) {
  const classes = [styles.badge, VARIANT_CLASS[variant], mono ? styles.mono : "", className]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
