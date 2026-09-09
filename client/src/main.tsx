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

// Drift's own token foundation. It was haus-tokens' primitive, brand, motion
// and semantic layers until 2026-09-09; Drift is independent now and ships them
// itself, under --drift-*, generated as the closure of what Drift reads (see
// tokens/README.md). Drift's own layers below sit above it and win where they
// resolve a role differently.
import "./tokens/foundation.css";
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
