// ─────────────────────────────────────────────
// start.js — مُشغّل واحد للإنتاج / خدمة Windows
//
// غرضه: عملية واحدة تخدم الواجهة والـAPI (Express يخدم dist/)، مع:
//   - فحص أن الواجهة مبنية فعلاً قبل الإقلاع (وإلا يفتح المتصفح صفحة فارغة)
//   - إعادة تشغيل عند الخروج غير الطبيعي (الخدمة Needs it)
//   - سجل نظيف على stdout يذهب إلى سجل الخدمة
// ─────────────────────────────────────────────
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// start.js في جذر المشروع، فالمجلد الجذر هو dirname لهذا الملف مباشرة
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist", "index.html");
const SERVER = path.join(ROOT, "server", "server.js");

if (!fs.existsSync(DIST)) {
  console.error("[start] لم يُبنَ الواجهة بعد. شغّل: npm run build");
  process.exit(1);
}

// NODE_ENV=production يوقف كشف تفاصيل الأخطاء ويوقظ فحوص الأسرار الصارمة
const child = spawn(process.execPath, [SERVER], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
});

let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  child.kill(code === "restart" ? "SIGTERM" : signalFor(code));
  // احتياط: إن رفض الخروج نُجبره بعد 10 ثوانٍ
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000).unref?.();
};
const signalFor = (code) => (code === "restart" ? "SIGTERM" : "SIGTERM");

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

child.on("exit", (code, signal) => {
  if (stopping) return;
  console.error(`[start]_api exited code=${code} signal=${signal || "none"} — restarting in 3s`);
  setTimeout(() => {
    spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
      detached: false,
    });
  }, 3000);
});