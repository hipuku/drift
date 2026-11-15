/**
 * The API reference page, at /reference/.
 *
 * Scalar renders the repository's openapi.yaml, read at build time, so the
 * page cannot say anything the contract does not. It is a second Vite entry
 * beside the app, built into the same deploy, with Drift's own fonts and
 * tokens. There is no live API behind drift.hipuku.dev, so nothing on the page
 * sends a request: the request runner, the client snippets' "try it" and the
 * agent are off, and so is Scalar's telemetry.
 */

import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-notch";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";

import "../tokens/layers.css";
import "../tokens/foundation.css";
import "../tokens/primitives.css";
import "../tokens/semantics.css";
import "../styles/drift.css";

import "@scalar/api-reference/style.css";
import "./reference.css";

import { createApiReference } from "@scalar/api-reference";
import spec from "../../../openapi.yaml?raw";

createApiReference("#reference", {
  content: spec,
  theme: "none",
  withDefaultFonts: false,
  darkMode: true,
  forceDarkModeState: "dark",
  hideDarkModeToggle: true,
  hideTestRequestButton: true,
  hideClientButton: true,
  showDeveloperTools: "never",
  telemetry: false,
  agent: { disabled: true },
  documentDownloadType: "yaml",
  metaData: { title: "Drift API reference" },
});
