import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4001", changeOrigin: true },
      "/files": { target: "http://localhost:4001", changeOrigin: true },
    },
  },
  build: { target: "esnext", chunkSizeWarningLimit: 1200 },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
