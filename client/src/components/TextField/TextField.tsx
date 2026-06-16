import type { InputHTMLAttributes } from "react";
import { Text } from "../Text/Text.js";
import styles from "./TextField.module.css";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export function TextField({ label, id, className, ...rest }: TextFieldProps) {
  const inputClass = className ? `${styles.input} ${className}` : styles.input;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        <Text role="label-sm">{label}</Text>
      </label>
      <input id={id} className={inputClass} {...rest} />
    </div>
  );
}
