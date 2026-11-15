import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The API reference page, /reference/, built on its own after the app.
 *
 * A separate build rather than a second input to the app's: sharing one build,
 * Vite splits the fonts and tokens both pages import into a shared chunk, and
 * the app's own HTML and bundle change with it. Built apart, the app's output
 * is exactly what it was, and the reference carries its own copy of what it
 * needs. The dev server still serves /reference/ from the app's config.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: { reference: fileURLToPath(new URL("./reference/index.html", import.meta.url)) },
    },
  },
});
