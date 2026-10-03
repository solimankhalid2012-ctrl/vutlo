// ─────────────────────────────────────────────
// services/desktopSave.js — نسخ الملف المكتمل إلى سطح مكتب المستخدم
//
// لماذا خادم؟ لأن التطبيق يعمل محلياً على جهاز المستخدم (منفذ 4001)، فالسيرفر
// هو الوحيد الذي يملك صلاحية الكتابة على القرص. المتصفح لا يستطيع الكتابة في
// مجلد Desktop مباشرة (يحمّل إلى Downloads أو عبر Save As).
//
// كل شيء هنا نقي وقابل للاختبار: كشف المجلد، التنظيف، البحث عن اسم متاح.
// ─────────────────────────────────────────────
import fs from "fs";
import os from "os";
import path from "path";
import { DOWNLOAD_DIR } from "./paths.js";

const userError = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
};

/**
 * مجلد سطح المكتب. Windows ينقله أحياناً إلى OneDrive، والواجهة العربية قد
 * تغيّر الاسم الظاهر فقط (الاسم الداخلي يبقى Desktop)، لذا نجرّب المرشحين
 * بالترتيب. يمكن تجاوزه بمتغير البيئة DESKTOP_DIR (أجهزة بلا سطح مكتب/tests).
 */
export function desktopDir(env = process.env) {
  const home = env.USERPROFILE || os.homedir();
  const candidates = [
    env.DESKTOP_DIR,
    env.OneDrive && path.join(env.OneDrive, "Desktop"),
    path.join(home, "Desktop"),
    path.join(home, "OneDrive", "Desktop"),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch { /* غير موجود — نجرّب التالي */ }
  }
  const fallback = candidates[0] || path.join(home, "Desktop");
  try { fs.mkdirSync(fallback, { recursive: true }); } catch { /* قد يكون محمياً */ }
  return fallback;
}

/**
 * معرّف المهمة المستخرجة من اسم ملف داخل مجلد التنزيل.
 * الملفات: job_<id>.<ext> ثم بعد الأدوات: _converted / _compressed / _palette / .gif
 * مثال: job_abc123_x_converted.mp3 ⇒ job_abc123_x
 */
export function jobIdFromFileName(fileName) {
  const base = path.basename(String(fileName || ""))
    .replace(/\.[^.]+$/, "")            // امتداد
    .replace(/(_converted|_compressed|_palette)$/, ""); // لواحق الأدوات
  return /^job_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/.test(base) ? base : null;
}

/** أول اسم متاح في مجلد: file.mp4 ⇒ file (2).mp4 */
export function uniquePath(dir, fileName, exists = fs.existsSync) {
  const safe = path.basename(fileName);
  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  let candidate = path.join(dir, safe);
  for (let i = 2; i < 500 && exists(candidate); i += 1) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
  return candidate;
}

/** مسار المصدر داخل مجلد التنزيل فقط — أي محاولة خروج (../) تُرفض. */
export function resolveInDownloads(fileName, downloads = DOWNLOAD_DIR) {
  const raw = String(fileName || "").trim();
  if (!raw || raw !== path.basename(raw) || raw === "." || raw === "..")
    throw userError("اسم ملف غير صالح");
  const root = path.resolve(downloads);
  const src = path.resolve(root, raw);
  if (src !== root && !src.startsWith(root + path.sep))
    throw userError("مسار غير مسموح", 403);
  return src;
}

/**
 * نسخ ملف من مجلد التنزيل إلى سطح المكتب (نسخ لا نقل: يبقى الملف متاحاً
 * للتحويل إلى MP3/GIF بعد التحميل ولتنزيله من المتصفح).
 */
export function saveToDesktop(fileName, { env = process.env, downloads = DOWNLOAD_DIR } = {}) {
  const src = resolveInDownloads(fileName, downloads);
  if (!fs.existsSync(src)) throw userError("الملف غير موجود أو انتهت صلاحيته", 404);
  const dir = desktopDir(env);
  const dest = uniquePath(dir, path.basename(src));
  fs.copyFileSync(src, dest);
  let size = 0;
  try { size = fs.statSync(dest).size; } catch { /* تجاهُل */ }
  return { ok: true, dir, fileName: path.basename(dest), path: dest, size };
}