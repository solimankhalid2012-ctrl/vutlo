// ─────────────────────────────────────────────
// routes/uploadRoutes.js — رفع الملفات + رابط دائم + GIF من ملف محلي
//
// تركيب الطلب (بلا مكتبة multipart purposely):
//   POST /api/upload   body: بايتات الملف الخام، Content-Type: نوع الملف
//                      X-File-Name: الاسم الأصلي (encodeURIComponent)
//   POST /api/gif-local  { id, gif: {...} }  ⇒ GIF برابط دائم خاص به
//   GET  /api/upload/:id        ⇒ تقرير المسح المخزّن (بلا بايتات)
//   GET  /u/:id                 ⇒ الملف نفسه (عام، دائم، يُعرض أو يُنزَّل)
//
// ⚠️ لماذا express.raw لا multipart؟ إضافة حزمة جديدة = سطح ثقة جديد؛
// body الخام + ترويسة اسم واحدة تغطي كل ما نحتاجه، والمحلل يبقى Express.
// وكل الأسبقيات (ن nosniff، disposition، cache دائم) في serveHeaders.
// ─────────────────────────────────────────────
import express from "express";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import { ipKey } from "../config/rateKeys.js";
import { tryUser } from "../middleware/adminAuth.js";
import { clampGifArgs, GIF_DITHERERS, GIF_DEFAULTS, gifFromPath } from "../services/ffmpegService.js";
import {
  UPLOAD_DIR, UPLOAD_LIMITS, UPLOAD_MAX_BYTES,
  ensureUploadDir, saveUpload, saveGif, getUpload, serveHeaders,
} from "../services/uploadStore.js";

/** امتدادات يُقبل أن تكون فيديو محلياً (لعملية GIF) */
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg", "mpeg", "wmv", "flv", "3gp", "ts", "ogv", "gif"]);
const VIDEO_MIME = /^video\//i;

/** حدّ الرفع: الزائر أصغر ⇒ يمنع استنزاف ذاكرة الخادم من زائر بلا حساب. */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: Number(process.env.UPLOAD_MAX_PER_HOUR || 30),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عمليات رفع كثيرة — جرّب بعد قليل" },
});

/** حدّ منفصل لتحويل GIF (كل عملية FFmpeg ثقيلة: عملية + cpu + قرص) */
const gifLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: Number(process.env.GIF_LOCAL_MAX_PER_HOUR || 20),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تحويلات كثيرة — انتظر قليلاً" },
});

/** اسم الملف الأصلي يأتي في الترويسة (URL-encoded) — لا يمرّ على أي query string
 *  فلا يتحوّل إلى سجلّ قابل للتلاعب، وننقّيه بـsafeName داخل المخزن. */
function originalName(req) {
  const raw = String(req.get("x-file-name") || "").trim();
  if (!raw) return "file";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** السقف حسب الحساب: زائر 50MB، مسجَّل 200MB (قابل للضبط بالبيئة). */
function limitFor(req) {
  const u = tryUser(req);
  return { bytes: u?.sub ? UPLOAD_LIMITS.user : UPLOAD_LIMITS.guest, isUser: !!u?.sub };
}

/** 💾 الرفع: فحص ← كتابة ← رابط دائم */
export const uploadApiRoutes = express.Router();

uploadApiRoutes.post(
  "/upload",
  uploadLimiter,
  // الحدّ الأعلى دائماً على مستوى المحلل؛ السقف الأدقّ يُفرض بعده (أدناه)
  express.raw({ type: () => true, limit: UPLOAD_MAX_BYTES }),
  (req, res) => {
    const { bytes: cap, isUser } = limitFor(req);
    const declared = Number(req.get("content-length") || 0);
    // رفض مبكر قبل buffering إذا صرّح العميل بحجم أكبر من سقفه
    if (declared && declared > cap) {
      return res.status(413).json({ error: tooBig(cap, isUser), limit: cap });
    }
    const buf = req.body instanceof Buffer ? req.body : new Uint8Array(0);
    if (buf.length > cap) return res.status(413).json({ error: tooBig(cap, isUser), limit: cap });

    try {
      const out = saveUpload({
        name: originalName(req),
        bytes: buf,
        contentType: req.get("content-type") || "",
        userId: tryUser(req)?.sub || null,
      });
      res.json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error("[upload]", e.message);
      res.status(status).json({
        error: e.expose ? e.message : "تعذّر حفظ الملف",
        ...(e.report ? { scan: { score: e.report.score, verdict: e.report.verdict, reasons: e.report.reasons, detected: e.report.detected } } : {}),
      });
    }
  }
);

/** تقرير المسح المخزّن (الواجهة تعرضه بعد إعادة فتح الصفحة بلا رفع جديد) */
uploadApiRoutes.get("/upload/:id", (req, res) => {
  const rec = getUpload(req.params.id);
  if (!rec) return res.status(404).json({ error: "الملف غير موجود" });
  res.json({ id: rec.id, name: rec.name, size: rec.size, mime: rec.mime, createdAt: rec.createdAt, scan: rec.scan });
});

/** 🎞️ تحويل ملف فيديو مرفوع محلياً إلى GIF ⇒ رابط دائم جديد
 *  ⚠️ الـJSON يُحلَّل هنا لا في server.js: هذا الراوتر مركّب **قبل**
 *  express.json حتى لا يبتلع محلل JSON ملفات application/json المرفوعة،
 *  فالنقاط التي تحتاج JSON تستعمل محللها الخاص المحدود. */
uploadApiRoutes.post("/gif-local", gifLimiter, express.json({ limit: "64kb" }), async (req, res) => {
  const rec = getUpload(String(req.body?.id || ""));
  if (!rec) return res.status(404).json({ error: "الملف غير موجود — ارفعه أولاً" });
  if (!VIDEO_EXTS.has(rec.ext) && !VIDEO_MIME.test(rec.mime || "")) {
    return res.status(415).json({ error: "هذا ليس ملف فيديو — GIF يحتاج فيديو" });
  }
  ensureUploadDir();
  const opts = clampGifArgs(req.body?.gif || {});
  const tmp = path.join(UPLOAD_DIR, `.gifsrc_${rec.id}_${Date.now().toString(36)}.gif`);
  try {
    await gifFromPath(rec.full, tmp, opts);
    const bytes = fs.readFileSync(tmp);
    const out = saveGif({ name: gifName(rec.name), bytes, sourceId: rec.id });
    res.json({ ...out, gif: opts, sourceId: rec.id });
  } catch (e) {
    console.error("[gif-local]", e.message);
    res.status(e.status || 500).json({ error: e.expose ? e.message : "فشل إنشاء GIF — قد يكون الفيديو تالفاً أو codec غير مدعوم" });
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* الملف المؤقت اختفى */ }
  }
});

/** 🌐 الرابط الدائم: GET /u/:id — العرض العام (وليس /api) لأن الـembed
 *  في كود المستخدم لا يرسل Authorization ولا CORS يُقرأ في <img>/<video>. */
export const uploadPublicRoutes = express.Router();

uploadPublicRoutes.get("/u/:id", (req, res) => {
  const rec = getUpload(req.params.id);
  if (!rec) return res.status(404).json({ error: "الملف غير موجود" });
  res.set(serveHeaders(rec));
  // ⛔ أي امتداد لم نتحقّق منه لا يُقدَّم أبداً (حتى لو كُتب على القرص يدوياً)
  if (!isSafeToServe(rec.ext)) return res.status(415).json({ error: "هذا النوع لا يُقدَّم" });
  res.sendFile(rec.full);
});

/** أي مسار تحت /u/ لا يطابق /u/:id ⇒ 404 JSON لا صفحة SPA (الواجهة
 *  كانت تخدم index.html لـ/u/ فيبدو الرابط_public حيّاً وهو ميت) */
uploadPublicRoutes.use("/u", (req, res) => res.status(404).json({ error: "رابط غير صالح" }));

/** نفس قائمة canHost لكن كمحوّل خام بلا تقرير (للعرض) */
function isSafeToServe(ext) {
  return !["html", "htm", "xhtml", "svg", "js", "mjs", "php", "phtml", "shtml", "xml", "xsl", "swf", "jar", "vbs", "hta"].includes(String(ext || "").toLowerCase());
}

function tooBig(cap, isUser) {
  const mb = Math.round(cap / 1048576);
  return isUser
    ? `حجم الملف يتجاوز ${mb}MB (سقف الحساب المسجَّل)`
    : `سقف الزائر ${mb}MB — سجّل دخولاً لرفع حتى ${Math.round(UPLOAD_LIMITS.user / 1048576)}MB`;
}

/** اسم GIF مشتق من اسم المصدر (مبدّل الامتداد فقط) */
function gifName(name) {
  const base = String(name || "video").replace(/\.[^.]+$/, "") || "video";
  return `${base.slice(0, 60)}.gif`;
}

/** توثيق بسيط يُضاف إلى /api/docs */
export const uploadDocs = {
  limits: { guest: Math.round(UPLOAD_LIMITS.guest / 1048576), user: Math.round(UPLOAD_LIMITS.user / 1048576) },
  gif: { defaults: GIF_DEFAULTS, dither: GIF_DITHERERS },
  routes: [
    { method: "POST", path: "/upload", headers: { "X-File-Name": "encodeURIComponent(name)", "Content-Type": "mime" }, desc: "رفع ملف ⇒ { id, url: '/u/<id>' } (سقف الزائر 50MB / الحساب 200MB)"},
    { method: "GET", path: "/upload/:id", desc: "تقرير مسح الملف المخزَّن" },
    { method: "POST", path: "/gif-local", body: { id: "string", gif: "GIF_OPTS?" }, desc: "فيديو محلي مرفوع ⇒ GIF برابط دائم" },
    { method: "GET", path: "/u/:id", desc: "الملف (رابط دائم عام)" },
  ],
};
