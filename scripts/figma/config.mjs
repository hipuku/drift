/* What the Figma parity check compares, and where each side lives.

   drift's Figma file holds everything in one place: the variables (two
   collections, drift/primitives and drift/roles, under the code's names), a
   page per component, and a Screens page drawn from the running app. Screens
   are compositions, and the components on that page (the icons and the top
   bar) are construction parts for them, so neither is compared. */

export const FIGMA_FILE = { key: "cG4D315cHRDKDwMQovDu7R", name: "drift" };

export const PATHS = {
  /* Every stylesheet that declares a --drift-* property, in main.tsx's order. */
  tokens: [
    "client/src/tokens/layers.css",
    "client/src/tokens/foundation.css",
    "client/src/tokens/primitives.css",
    "client/src/tokens/semantics.css",
    "client/src/styles/drift.css",
  ],
  components: "client/src/components",
  snapshot: "figma/snapshot/drift.json",
  baseline: "figma/baseline.json",
  exceptions: "figma/exceptions.json",
};

/* Token categories Figma holds as variables. The rest of drift's tokens are
   drawn another way in Figma: elevation and focus as effect styles, the page
   gradient as a fill, so they are not compared as variables. */
export const VARIABLE_CATEGORIES = new Set([
  "color",
  "type",
  "space",
  "radius",
  "z",
  "border",
  "opacity",
  "size",
  "motion",
]);

/* The states a stylesheet can express, in the words Figma's `State` axis uses.
   Focus is not compared: drift draws one ring for every element from the focus
   tokens, and a Figma `Focus` variant would read as drift on every component.
   Read-only is a field's content, not an interaction. */
export const CSS_STATES = { hover: "hover", active: "pressed", disabled: "disabled" };
export const COMPARED_STATES = new Set(Object.values(CSS_STATES));

/* Pages whose components are construction parts, not drift's components. */
export const PART_PAGES = new Set(["Screens"]);

/* A leading underscore or dot, or a slash (`Icon/Colour`), marks a part. */
export const isPrivateComponent = (name) =>
  name.startsWith("_") || name.startsWith(".") || name.includes("/");
