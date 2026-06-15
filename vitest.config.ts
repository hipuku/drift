import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @haus/colour-utils is consumed as TypeScript source via a local file:
    // link. Inline it so Vite transforms it rather than treating it as a
    // pre-built external dependency.
    server: {
      deps: {
        inline: [/@haus\/colour-utils/],
      },
    },
  },
});
