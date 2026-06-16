import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { Text } from "../Text/Text.js";
import styles from "./Callout.module.css";

type Variant = "error" | "warning" | "info" | "success";

const VARIANT_CLASS: Record<Variant, string> = {
  error: styles.error!,
  warning: styles.warning!,
  info: styles.info!,
  success: styles.success!,
};

const VARIANT_ICON: Record<Variant, IconDefinition> = {
  error: faTriangleExclamation,
  warning: faTriangleExclamation,
  info: faCircleInfo,
  success: faCircleCheck,
};

interface CalloutProps {
  variant?: Variant;
  children: ReactNode;
}

export function Callout({ variant = "info", children }: CalloutProps) {
  return (
    <div className={`${styles.callout} ${VARIANT_CLASS[variant]}`} role="alert">
      <FontAwesomeIcon icon={VARIANT_ICON[variant]} className={styles.icon} />
      <Text role="body-sm" className={styles.body}>
        {children}
      </Text>
    </div>
  );
}
