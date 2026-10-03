// ─────────────────────────────────────────────
// start.js — مُشغّل واحد للإنتاج / خدمة Windows
//
// غرضه: عملية واحدة تخدم الواجهة والـAPI (Express يخدم dist/)، مع:
//   - فحص أن الواجهة مبنية فعلاً قبل الإقلاع (وإلا يفتح المتصفح صفحة فارغة)
//   - إعادة تشغيل عند الخروج غير الطبيعي (كما تحتاج خدمة Windows)
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
// خدمة Windows بلا طرفية، فبلا هذا لا يرى المطوّر ولا المستخدم أي خطأ على
// الإطلاق. نكتب نسخة إلى logs/ ونُبقي على stdout أيضاً ليبقى مفيداً عند
// التشغيل من الطرفية.
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
// ⚠️ خطأ حقيقي كان هنا: writeLog كان يستدعي process.stdout.write بعد تعديله
// ⇒ استدعاء ذاتي لا نهائي (سجل مكرّر 200× لكل سطر حتى RangeError داخل
// معالج الطلب، وردود API مقطوعة ⇒ JSON.parse يفشل في المتصفح).
// الحل: نحفظ المقبض الأصلي ونكتب عبره مباشرة، بلا تعديل process.stdout.
const origWrite = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);
function writeLog(chunk) {
  const text = String(chunk);
  try { logStream.write(text); } catch {}
  try { origWrite(text); } catch {}
}
function writeErr(chunk) {
  const text = String(chunk);
  try { logStream.write(text); } catch {}
  try { origErr(text); } catch {}
}

// ⚠️ لا بد من pipe: مع stdio:"inherit" يكتب الابن مباشرة في مقبض العملية
// الأصلي، فلا يمرّ عبر نسخنا إلى السجل إطلاقاً (وهو ما أفقد السجل فارغاً).
// مع pipe نمرّر مخرجات الابن بأنفسنا إلى السجل والطرفية معاً.
const SERVER_ARGS = [SERVER];
let child = null;
let startedAt = 0;
let stopping = false;
let restarts = 0;   // عدد مرات الإعادة منذ آخر إقلاع مستقر
let fastExits = 0;  // مرات الموت السريع المتتالية (حلقة انهيار)

const RESTART_BASE_MS = 1_000;
const RESTART_MAX_MS = 30_000;
const CRASH_WINDOW_MS = 20_000; // إقلاع ثم موت قبل هذا = تكرار انهيار
const CRASH_LOOP_MAX = 5;       // بعدها نتوقف عمداً بدل الدوران إلى الأبد
const STABLE_MS = 60_000;       // هذه المدة من التشغيل = إقلاع ناجح

function startChild() {
  rotateIfNeeded();
  startedAt = Date.now();
  child = spawn(process.execPath, SERVER_ARGS, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
  });

  let stderrTail = "";
  child.stdout.on("data", (b) => writeLog(b));
  child.stderr.on("data", (b) => {
    writeErr(b);
    stderrTail = (stderrTail + b.toString()).slice(-4096);
  });

  child.on("error", (e) => {
    writeLog(`[start] spawn error: ${e.message}\n`);
  });

  child.on("exit", (code, signal) => {
    const uptime = Date.now() - startedAt;
    writeLog(`[start] api exited code=${code} signal=${signal || "none"} after ${Math.round(uptime / 1000)}s (restarts=${restarts})\n`);

    // إغلاق متعمّد من المشغّل ⇒ لا إعادة تشغيل
    if (stopping) return;

    // ⚠️ المنفذ ما زال مشغولاً غالباً (المهمة القديمة لم تُغلق بعد) ⇒
    // إعادة التشغيل الفورية كانت تدور بلا نهاية عند أي خطأ إقلاع.
    if (stderrTail.includes("EADDRINUSE")) {
      writeLog("[start] المنفذ 4001 مشغول — ننتظر حتى يُحرَّر قبل إعادة الإقلاع.\n");
    }

    if (uptime < CRASH_WINDOW_MS) fastExits += 1;
    else fastExits = 0;

    if (fastExits >= CRASH_LOOP_MAX) {
      writeLog(
        `[start] ⛔ توقف الإشراف: ${fastExits} محاولات إقلاع فاشلة متتالية (أقل من ${CRASH_WINDOW_MS / 1000}s).\n` +
        "[start] راجع السجل أعلاه، ثم شغّل المهمة مجدداً بعد إصلاح السبب.\n",
      );
      process.exit(1);
    }

    if (uptime >= STABLE_MS) restarts = 0; // إقلاع مستقر ⇒ ابدأ العد من الصفر
    const delay = Math.min(RESTART_MAX_MS, RESTART_BASE_MS * 2 ** Math.min(restarts, 5));
    restarts += 1;
    setTimeout(startChild, delay);
  });
}

// ── إيقاف نظيف: ابن + كل أبنائه (yt-dlp/ffmpeg) على ويندوز ──
const stop = () => {
  if (stopping) return;
  stopping = true;
  writeLog("[start] stopping…\n");
  if (!child) process.exit(0);
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
      setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 10_000).unref?.();
    }
  } catch {}
  // مهلة قصيرة ثم نخرج حتى لا نبقى معلّقين بلا ابن
  setTimeout(() => process.exit(0), 5_000).unref?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("SIGHUP", stop);
process.on("exit", () => {
  try { if (child && !child.killed && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }); } catch {}
});

startChild();