import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts, the Stack Sans family: Text for reading, Notch for display; Fira Code
// for token values.
import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-notch";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";

// Cascade layer order, declared before anything opens a layer.
import "./tokens/layers.css";

// The primitive and motion layers are haus-tokens'. The semantic layer above
// them is Drift's own theme, and primitives.css is only what Drift overrides
// (see tokens/README.md).
import "haus-tokens/primitives.css";
import "haus-tokens/motion.css";
import "./tokens/primitives.css";
import "./tokens/semantics.css";

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
