import type { ElementType, ReactNode } from "react";
import styles from "./Text.module.css";

/**
 * The type roles, from drift's typography scale. Appearance is chosen by
 * role; the rendered element (and thus document semantics / accessibility) is
 * chosen independently via `as`. An <h1> and a hero callout can both be
 * `display`; a visually small section heading on an <h2> uses `heading-sm`.
 */
export type TypeRole =
  | "display"
  | "heading-lg"
  | "heading"
  | "heading-sm"
  | "body-lg"
  | "body"
  | "body-sm"
  | "label"
  | "label-sm"
  | "label-xs"
  | "mono";

const ROLE_CLASS: Record<TypeRole, string> = {
  display: styles.display!,
  "heading-lg": styles.headingLg!,
  heading: styles.heading!,
  "heading-sm": styles.headingSm!,
  "body-lg": styles.bodyLg!,
  body: styles.body!,
  "body-sm": styles.bodySm!,
  label: styles.label!,
  "label-sm": styles.labelSm!,
  "label-xs": styles.labelXs!,
  mono: styles.mono!,
};

interface TextProps {
  role: TypeRole;
  /** The element to render. Defaults to span; use h1–h3, p, etc. for semantics. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export function Text({ role, as: Tag = "span", className, children }: TextProps) {
  const roleClass = ROLE_CLASS[role];
  return <Tag className={className ? `${roleClass} ${className}` : roleClass}>{children}</Tag>;
}
