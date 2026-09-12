import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/unit/setup.js",
    globals: true,
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
