import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts — the Stack Sans family: Text for reading, Notch for display.
import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-notch";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";

// haus design system — Drift is its first true consumer.
import "@haus/tokens/primitives.css";
import "@haus/tokens/semantics.css";
import "@haus/tokens/motion.css";

// Drift's thin layer on top: accent, fonts, tool tokens.
import "./styles/drift.css";
import "./styles/base.css";

import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
