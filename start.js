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
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "service.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024;

if (!fs.existsSync(DIST)) {
  console.error("[start] لم يُبنَ الواجهة بعد. شغّل: npm run build");
  process.exit(1);
}

// ── سجل الخدمة ──
// خدمة Windows لا تملك طرفية، فبلا هذا لا يرى المطوّر ولا المستخدم أي خطأ
// على الإطلاق (shutdownowns seule stdout nowhere). نكتب نسخة إلى logs/ ونُبقي
// على stdout أيضاً كي يبقى مفيداً عند التشغيل من الطرفية.
fs.mkdirSync(LOG_DIR, { recursive: true });
function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch {}
}
rotateIfNeeded();

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
const stamp = () => new Date().toISOString();
function writeLog(chunk) {
  const text = String(chunk);
  try { logStream.write(text); } catch {}
  try { process.stdout.write(text); } catch {}
}
const origWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (c, ...a) => { writeLog(c); return origWrite(c, ...a); };
const origErr = process.stderr.write.bind(process.stderr);
process.stderr.write = (c, ...a) => { writeLog(c); return origErr(c, ...a); };

// ⚠️ لا بد من pipe: مع stdio:"inherit" يكتب الابن مباشرة في مقبض العملية
// الأصلي، فلا يلتقطه تعليق stdout في هذا الملف (وهو ماarfق السجل فارغاً).
// مع pipe نُمرّر مخرجات الابن بأنفسنا إلى السجل والطرفية معاً.
const child = spawn(process.execPath, [SERVER], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
});
child.stdout.on("data", (b) => { writeLog(b); origWrite(b); });
child.stderr.on("data", (b) => { writeLog(b); origErr(b); });

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 10_000).unref?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("exit", (code, signal) => {
  writeLog(`[start] api exited code=${code} signal=${signal || "none"}\n`);
  if (stopping) return;
  setTimeout(() => {
    spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT, stdio: "inherit", env: process.env, detached: false,
    });
  }, 3000);
});