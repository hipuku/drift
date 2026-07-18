import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the backend (no CORS needed in dev).
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // The progress WebSocket shares the backend HTTP server; it accepts any
      // path, so we forward /ws straight through with upgrade support.
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
