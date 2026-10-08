// ─────────────────────────────────────────────
// services/uploadStore.js — تخزين الملفات المرفوعة برابط دائم
//
// لماذا هذا الملف؟ الرفع يحتاج ثلاث صفات لا يوفّرها مجلد التحميلات:
//   1) رابط ثابت لا تنتهي صلاحيته (مهمة التحميل تُحذف بعد ساعات)؛
//   2) اسم قرص لا يُشتق من اسم المستخدم إطلاقاً (لا path traversal ولا
//      تنفيذ عبر .htaccess وما شابه)؛
//   3) بيانات وصفية (الاسم الأصلي، الحجم، تقرير المسح) تنجو من إعادة التشغيل.
//
// Location: downloads/uploads/ داخل مجلد التحميلات. منظّف الاستبقاء
// (retention.js) يمرّ على الملفات في المستوى الأعلى فقط وباسم job_*
// ويتخطّى المجلدات ⇒ لا يمسّ ما هنا. ✅
// ─────────────────────────────────────────────
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DOWNLOAD_DIR } from "./paths.js";
import { safeName, extsOf, scan, canHost, serveMode } from "../../shared/fileScan.js";

// ⚠️ مسار مطلق: res.sendFile في Express يرفض المسارات النسبية
// (TypeError: path must be absolute) ⇒ كل رابط دائم كان 500 فعلياً.
export const UPLOAD_DIR = path.resolve(DOWNLOAD_DIR, "uploads");

/** سقوف الرفع: زائر / مسجَّل — قابلة للضبط بالبيئة */
const MB = 1048576;
export const UPLOAD_LIMITS = {
  guest: Math.max(1, Number(process.env.UPLOAD_MAX_MB_GUEST) || 50) * MB,
  user: Math.max(1, Number(process.env.UPLOAD_MAX_MB_USER) || 200) * MB,
};
/** الحدّ الأقصى الذي يسمح به محلل الجسم (الحدّ الأعلى دائماً) */
export const UPLOAD_MAX_BYTES = UPLOAD_LIMITS.user;

/** معرّف عام قصير: لا يُشتق من اسم الملف ولا من وقت الرفع (تفادي التخمين) */
const newId = () => crypto.randomBytes(9).toString("base64url");

/** 🛡️ معرّف صالح للاستخدام في مسار: alphanumerics فقط بطول محدود */
export function isValidId(id) {
  return /^[A-Za-z0-9_-]{8,24}$/.test(String(id || ""));
}

/** يضمن وجود مجلد الرفع. */
export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o755 });
}

/** الامتداد الذي يُحفظ على القرص: من الاسم المُنقّى، أو من الصيغة المكتشفة */
function diskExt(name, report) {
  const fromName = extsOf(name).pop() || "";
  if (fromName) return `.${fromName}`;
  const detected = report?.detected?.ext || "";
  return detected ? `.${detected}` : "";
}

const metaPath = (id) => path.join(UPLOAD_DIR, `${id}.meta.json`);

/**
 * فحص + حفظ. يرمي خطأً موسوماً بـ{ status, expose } عند الرفض.
 * @returns {{ id, name, url, size, mime, mode, scan }}
 */
export function saveUpload({ name, bytes, contentType = "", userId = null } = {}) {
  ensureUploadDir();
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const clean = safeName(name);

  if (!buf.length) throw badRequest("الملف فارغ");

  const report = scan({ name: clean, bytes: buf, size: buf.length });

  // ⛔ خطير ⇒ لا يُكتب على القرص إطلاقاً (الامتداد الخطر أو المحتوى التنفيذي)
  const host = canHost(clean, report);
  if (!host.ok) throw blocked(host.reason, report, host.code || 415);

  const id = newId();
  const file = `${id}${diskExt(clean, report)}`;
  const target = path.join(UPLOAD_DIR, file);
  // اسم القرص من المُعرّف + الامتداد فقط ⇒ لا حقن مسار مهما كان الاسم الأصلي
  fs.writeFileSync(target, buf, { mode: 0o644 });

  const meta = {
    id,
    file,
    name: clean,
    ext: diskExt(clean, report).replace(".", ""),
    size: buf.length,
    mime: report.detected.mime || contentType || "application/octet-stream",
    userId,
    createdAt: new Date().toISOString(),
    scan: { score: report.score, verdict: report.verdict, detected: report.detected, reasons: report.reasons, language: report.language, agreement: report.agreement },
  };
  fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), "utf8");

  return { id, name: clean, url: publicUrl(id), file, size: meta.size, mime: meta.mime, mode: serveMode(meta.ext), scan: meta.scan };
}

export const publicUrl = (id) => `/u/${id}`;

/** يقرأ بيانات الملف. يرمي 404 إن لم يوجد أو تلف. */
export function getUpload(id) {
  if (!isValidId(id)) return null;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath(id), "utf8"));
  } catch {
    return null;
  }
  if (!meta?.file || meta.file !== path.basename(meta.file)) return null;
  const full = path.join(UPLOAD_DIR, meta.file);
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return { ...meta, full };
}

/** ⚠️ ترويسات العرض: nosniff إلزامي، والتخزين طويل لأن الرابط دائم. */
export function serveHeaders(meta) {
  return {
    "Content-Type": meta.mime || "application/octet-stream",
    "Content-Disposition": `${serveMode(meta.ext) === "inline" ? "inline" : "attachment"}; filename="${asciiName(meta.name)}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

/** اسم ASCII آمن لترويسة Content-Disposition (المتصفحات القديمة لا تفهم UTF-8) */
function asciiName(name) {
  return String(name || "file").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 80) || "file";
}

/** رابط GIF مشتق من ملف مرفوع: يُخزَّن بنفس الآلية فيأخذ رابطاً دائماً */
export function saveGif({ name, bytes, sourceId = null } = {}) {
  const out = saveUpload({ name, bytes, contentType: "image/gif" });
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(out.id), "utf8"));
    meta.sourceId = sourceId;
    fs.writeFileSync(metaPath(out.id), JSON.stringify(meta, null, 2), "utf8");
  } catch { /* البيانات الوصفية ثانوية: فشلها لا يُفشل العملية */ }
  return out;
}

/* ── أخطاء موسومة تُترجم إلى استجابات HTTP نظيفة ───────────────────── */
function badRequest(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}
function blocked(message, report, status = 415) {
  const e = badRequest(message, status);
  e.report = report;
  return e;
}

export { badRequest };