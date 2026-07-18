import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTheme } from "../lib/theme.js";
import styles from "./ThemeControls.module.css";

/** The light/dark toggle in the product chrome. */
export function ThemeControls() {
  const { mode, toggle } = useTheme();

  return (
    <button
      type="button"
      className={styles.iconBtn}
      onClick={toggle}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
    >
      <FontAwesomeIcon icon={mode === "dark" ? faSun : faMoon} />
    </button>
  );
}
