/**
 * Light/dark theme state.
 *
 * The brand accent is a fixed OKLCH tonal ramp baked into styles/drift.css
 * (--accent-h / --accent-c); only the light/dark choice is runtime state. It is
 * persisted to localStorage and applied to <html>; the pre-paint script in
 * index.html reads the same key to avoid a flash on load.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "drift-theme";

function initialMode(): ThemeMode {
  if (typeof document !== "undefined") {
    const set = document.documentElement.dataset.theme;
    if (set === "light" || set === "dark") return set;
  }
  // Dark is Drift's default.
  return "dark";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  return { mode, setMode, toggle };
}
