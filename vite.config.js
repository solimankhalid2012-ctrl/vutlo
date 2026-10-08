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
    // ⏱️ الافتراضي 5s كان ضيّقاً على اختبارات الواجهة: تركيب التطبيق وحده
    // يستهلك ~1.5s (framer-motion + تحميل كسول) ⇒ الفشل كان بمهلة لا بخطأ
    // حقيقي. نرفع السقف فقط — لا نُلغي أي تحقق.
    testTimeout: 20000,
  },
});
