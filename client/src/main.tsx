import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts — the Stack Sans family: Text for reading, Notch for display; Fira Code
// for token values.
import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-notch";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";

// haus design tokens, vendored (see tokens/README.md) so Drift builds
// standalone — @haus/tokens is not published to npm.
import "./tokens/primitives.css";
import "./tokens/semantics.css";
import "./tokens/motion.css";

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
