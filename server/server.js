// ─────────────────────────────────────────────
// VideoVault Pro — Backend (Node + Express + yt-dlp + FFmpeg)
// Endpoints: info | download | job | playlist | schedule | convert | compress | gif | docs | bot
// ─────────────────────────────────────────────
// ⚠️ يجب أن يكون أول استيراد — وإلا قُرئ YTDLP_BIN فارغاً (ESM hoisting)
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { CSP_DIRECTIVES } from "./config/csp.js";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getVideoInfo, getPlaylist, queueDownload, getJob, getJobRecord, cancelJob, ytdlpStatus, queueDepth } from "./services/ytdlpService.js";
import { convertTo, compressVideo, videoToGif, clampGifArgs, ffmpegDepth } from "./services/ffmpegService.js";
import { scheduleDownload, cancelSchedule, listSchedulesFor, restoreSchedules } from "./services/schedulerService.js";
import { handleTelegramUpdate } from "./services/telegramBot.js";
import { initDb, db } from "./services/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { requireAdmin, tryUser, hasBearer } from "./middleware/adminAuth.js";
import { securityReport } from "./config/security.js";
import { verifyWhatsappWebhook, whatsappPostAllowed, handleWhatsappUpdate } from "./services/whatsappService.js";
import { validateEmail } from "./config/passwords.js";
import { telegramWebhookOk, whatsappWebhookOk } from "./config/webhooks.js";
import { ipKey, loginKey } from "./config/rateKeys.js";
import { startRetention } from "./services/retention.js";
import { saveToDesktop, jobIdFromFileName } from "./services/desktopSave.js";
import { resolveTrustedHops, clientIpFromRequest } from "./config/trustProxy.js";

// مستخدم اختياري من توكن المستخدم (للنقاط) — لا يفشل بدونه.
// يقرأ من middleware الموحّد (algorithms مقيدة + سر من config) بدل تكرار المنطق.
const optionalUser = (req) => tryUser(req);

/**
 * رسالة خطأ آمنة للعميل.
 * الخدمات تعلّم الأخطاء المفيدة للمستخدم بـexpose=true؛ ما عدا ذلك (مسارات
 * داخلية، stderr من yt-dlp/ffmpeg، أخطاء Prisma) يبقى في السجل فقط.
 */
const publicError = (e, fallback = "فشل الطلب") =>
  e?.expose ? String(e.message) : fallback;

// ⚠️ حُذف هنا حدّ الجودة حسب الخطة مع نظام الدفع بالكامل: كان يُرجع 402
// فوق 1080p لكل حساب غير Pro. كل الجودات (حتى 8K) متاحة الآن للجميع.
// عمود User.plan باقٍ في القاعدة كبيانات فقط تُمنح من لوحة الأدمن.

// رسائل التواصل (الإنتاج: جدول DB)
const messages = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// ⚠️ الافتراضي كان 4000 بينما proxy في vite.config.js يشير إلى 4001 ⇒ مع .env
// مفقود كانت الواجهة لا تصل للـAPI إطلاقاً.
const PORT = process.env.PORT || 4001;

// عدد الـproxies الموثوقة. الافتراضي 0 = لا نثق بأي ترويسة (نشر مباشر).
// مع proxy محلي (nginx على نفس الجهاز) ⇒ TRUSTED_HOPS=1.
// الإعداد وحده ليس كافياً: نصحّح req.ip بأنفسنا أدناه، لأن إعداد Express
// الجاهز يُعيد عنواناً يمكن للعميل تزويره (انظر config/trustProxy.js).
const TRUSTED_HOPS = resolveTrustedHops(process.env.TRUST_PROXY);
app.set("trust proxy", TRUSTED_HOPS);
app.disable("x-powered-by");

// 🔐 تصحيح req.ip على مستوى الطلب قبل أي مستهلك (حدود، سجل، تقارير خطأ):
// نأخذ trustedHops عنصراً من الطرف الأيمن فقط، فأي قيمة زرعها العميل في
// X-Forwarded-For تُlocated على يسار عنوانه الحقيقي وتُهمَل.
app.use((req, _res, next) => {
  Object.defineProperty(req, "ip", {
    value: clientIpFromRequest(req, TRUSTED_HOPS),
    configurable: true,
    writable: true,
  });
  next();
});

/** سياسة أمان المحتوى — انظر server/config/csp.js لشرح كل قرار. */
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: CSP_DIRECTIVES,
  },
}));
app.use(cors({
  origin: (process.env.CLIENT_URL || "http://localhost:5173").split(","),
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "256kb" }));

/** ينظّف أي نص قادم من المستخدم قبل تسجيله أو عرضه (يمنع حقن السجل).
 *  نستعمل [\x00-\x1F] بالأساس السداسي، فمحرّك lint يرفض \u في regex. */
const CTRL = /[\x00-\x1F\x7F]/g; // eslint-disable-line no-control-regex
const clean = (v, max = 300) => String(v ?? "").replace(CTRL, " ").slice(0, max);

/** دخول: 5 محاولات فاشلة / 15 دقيقة لكل (IP + بريد) — انظر config/rateKeys.js
 *  ⚠️ كان لكل IP وحده ⇒ 5 محاولات فاشلة كانت تُقفل الحسابات لكل مستخدم
 *  خلف نفس الـNAT/شبكة الجوال (CGNAT) لمدة 15 دقيقة. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  keyGenerator: loginKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "محاولات دخول كثيرة — انتظر 15 دقيقة ثم أعد المحاولة" },
});

/** سقف ثانٍ على الـIP وحده بسقف أعلى: يمنع تخمين *عناوين بريد مختلفة* من IP
 *  واحد (الحدّ الأول يسمح بذلك لأن كل بريد له مفتاح مستقل). */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: Number(process.env.LOGIN_IP_MAX_ATTEMPTS || 25),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "محاولات دخول كثيرة من هذا الجهاز — انتظر 15 دقيقة" },
});

app.use(["/api/auth/login", "/api/auth/register", "/api/admin/login"], loginIpLimiter, loginLimiter);

// 🛡️ حد عام خفيف لكل الـAPI (يمنع إغراق أي نقطة)
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_MAX_PER_MIN || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة — تمهّل قليلاً" },
});
app.use("/api", apiLimiter);

// 💰 حد أضيق على المسارات التي تشغّل yt-dlp (كل واحد عملية + شبكة)
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.HEAVY_MAX_PER_MIN || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات تحميل كثيرة — انتظر دقيقة" },
});
app.use(["/api/info", "/api/download", "/api/playlist"], heavyLimiter);

// ✉️ نموذج التواصل: حد منفصل (spam)
const contactLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: Number(process.env.CONTACT_MAX_PER_HOUR || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "رسائل كثيرة — جرّب لاحقاً" },
});

// 🐞 تشخيص: حد منفصل حتى لا يستنزف الحد العام للـAPI
const clientErrorLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: Number(process.env.CLIENT_ERROR_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم استلام بلاغات كثيرة — جرّب لاحقاً" },
});

// السجل عبر db (PostgreSQL + Prisma أو ذاكرة تلقائياً)

// ── POST /api/info — معاينة الفيديو ──
app.post("/api/info", async (req, res) => {
  try {
    const info = await getVideoInfo(req.body?.url);
    const u = optionalUser(req);
    await db.logHistory({ url: String(req.body.url).slice(0, 2048), title: info.title, thumbnail: info.thumbnail, kind: "preview", userId: u?.sub || null });
    if (u?.sub) db.addPoints(u.sub, 1).catch(() => {}); // 🏆 +1 لكل معاينة
    res.json(info);
  } catch (e) {
    console.error("[info]", e.message);
    res.status(e.status || 422).json({ error: publicError(e, "تعذّر تحليل الرابط — تأكد أنه عام وغير محمي") });
  }
});

// ── POST /api/download — بدء التحميل (خيارات متقدمة كاملة) ──
app.post("/api/download", async (req, res) => {
  try {
    const { url, quality = "1080p", format = "mp4", password = "", trimStart = "", trimEnd = "", subs = false, threads = 8, gif } = req.body || {};
    if (!url) return res.status(400).json({ error: "رابط مفقود" });
    if (!["mp4", "mp3", "webm", "mkv", "gif"].includes(format))
      return res.status(400).json({ error: "صيغة غير مدعومة" });
    // ⚠️ كان هنا حدّ 1080p (402) للخطة المجانية — أُزيل مع نظام الدفع
    const user = optionalUser(req);
    // 🎞️ خيارات GIF تُقصَّى هنا (وليس في ffmpeg) ⇒ ملف مهمّة واحد لكل تركيبة
    const gifOpts = format === "gif" ? clampGifArgs(gif || {}) : null;
    res.json(await queueDownload(url, { quality, format, password, trimStart, trimEnd, subs, threads, gif: gifOpts, userId: user?.sub || null }));
  } catch (e) {
    console.error("[download]", e.message);
    res.status(e.status || 500).json({ error: publicError(e, "فشل بدء التحميل") });
  }
});

// ── GET /api/job/:id — حالة مهمة + تقدم حي ──
// ⚠️ كان يعرض أي مهمة بالمعرّف فقط ⇒ IDOR (تسريب روابط/عناوين تحميلات غيرك).
// الآن: صاحب المهمة أو الأدمن فقط، ومهمة الضيف متاحة كما كانت.
const ownsJob = (job, req) => {
  if (!job) return false;
  const u = optionalUser(req);
  if (u?.role === "admin") return true;
  if (!job.userId) return !u; // مهمة ضيف: متاحة لمن لا توكن له
  return !!u && u.sub === job.userId;
};

/** 401 لتوكن منتهٍ/مزوّر بدل 403 "ليست لك" — رسالة أدقّ للمستخدم
 *  ملاحظة: مهمة الضيف (بلا userId) متاحة لمن لا توكن له فقط، فإذا سجّل
 *  صاحبها الدخول أثناء التحميل تولّد 403 — لذا نذكر السبب المحتمل. */
const denyJob = (res, req) => {
  if (hasBearer(req) && !optionalUser(req))
    return res.status(401).json({ error: "انتهت جلستك — سجّل الدخول من جديد" });
  return res.status(403).json({ error: "هذه المهمة ليست لحسابك (إن بدأت التحميل كزائر فأنهِ ثم ابدأ من جديد)" });
};

app.get("/api/job/:id", (req, res) => {
  const job = getJobRecord(req.params.id);
  if (!job) return res.status(404).json({ error: "المهمة غير موجودة أو انتهت صلاحيتها" });
  if (!ownsJob(job, req)) return denyJob(res, req);
  res.json(getJob(req.params.id));
});

// ── DELETE /api/job/:id — إلغاء مهمة جارية ──
app.delete("/api/job/:id", (req, res) => {
  const job = getJobRecord(req.params.id);
  if (!job) return res.status(404).json({ error: "المهمة غير موجودة أو انتهت صلاحيتها" });
  if (!ownsJob(job, req)) return denyJob(res, req);
  if (!cancelJob(req.params.id)) return res.status(409).json({ error: "لا يمكن إلغاء مهمة منتهية" });
  res.json({ ok: true });
});

// ── 💾 POST /api/save-desktop — نسخ الملف المكتمل إلى سطح مكتب المستخدم
// التطبيق محلي ⇒ السيرفر هو من يملك صلاحية الكتابة على القرص.
// 🔒 لا يكفي اسم الملف: أي زائر كان يمرّر /api/convert/:file ثم يحفظ ملف
// غيره. نستخرج معرّف المهمة من الاسم ونطلب نفس شرط الملكية في ownsJob.
const saveDesktopLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.SAVE_DESKTOP_MAX_PER_MIN || 30),
  standardHeaders: true,
});

app.post("/api/save-desktop", saveDesktopLimiter, (req, res) => {
  const fileName = String(req.body?.file || "");
  const jobId = jobIdFromFileName(fileName);
  if (!jobId) return res.status(400).json({ error: "اسم ملف غير صالح" });
  const job = getJobRecord(jobId);
  if (!job) return res.status(404).json({ error: "المهمة غير موجودة أو انتهت صلاحيتها" });
  if (!ownsJob(job, req)) return denyJob(res, req);
  try {
    res.json(saveToDesktop(fileName));
  } catch (e) {
    res.status(e.status || 500).json({ error: publicError(e, "تعذّر الحفظ على سطح المكتب") });
  }
});

// ── POST /api/playlist — معلومات قائمة تشغيل/قناة ──
app.post("/api/playlist", async (req, res) => {
  try {
    res.json(await getPlaylist(req.body?.url));
  } catch (e) {
    console.error("[playlist]", e.message);
    res.status(e.status || 422).json({ error: publicError(e, "تعذّر قراءة القائمة") });
  }
});

// ── ⏰ الجدولة ──
app.post("/api/schedule", async (req, res) => {
  try {
    const { url, runAt, quality = "1080p", format = "mp4", ...rest } = req.body || {};
    if (!["mp4", "mp3", "webm", "mkv", "gif"].includes(format))
      return res.status(400).json({ error: "صيغة غير مدعومة" });
    // ⚠️ كان هنا نفس حدّ الخطة في /api/download — أُزيل مع نظام الدفع
    const u = optionalUser(req);
    res.json(scheduleDownload({ url, runAt, options: { quality, format, ...rest }, userId: u?.sub || null }));
  } catch (e) {
    res.status(e.status || 400).json({ error: publicError(e, "تعذّر حفظ الجدولة") });
  }
});
// ⚠️ كان يرجع كل الجدولات لأي زائر (تسريب روابط) وأي زائر يلغي أي مهمة.
app.get("/api/schedules", async (req, res) => {
  const u = optionalUser(req);
  const isAdmin = u?.role === "admin";
  // ندمج الذاكرة (المؤقّتات النشطة) مع القاعدة (ما حُفظ قبل إعادة التشغيل)
  const rows = await db.listSchedules().catch(() => []);
  const live = new Map(listSchedulesFor(u?.sub ?? "").map((r) => [r.id, r]));
  const merged = new Map();
  for (const r of rows) {
    if (!isAdmin && r.userId && r.userId !== u?.sub) continue;
    merged.set(r.id, r);
  }
  for (const [id, r] of live) merged.set(id, { ...(merged.get(id) || {}), ...r });
  res.json([...merged.values()]);
});
app.delete("/api/schedule/:id", async (req, res) => {
  const u = optionalUser(req);
  if (!(await cancelSchedule(req.params.id, u?.role === "admin" ? undefined : u?.sub ?? ""))) {
    return res.status(404).json({ error: "غير موجودة" });
  }
  res.json({ ok: true });
});

// ── 🔄 تحويل / ضغط / GIF (FFmpeg على ملف مهمة موجودة) ──
// ⚠️ كلها كانت تقبل أي jobId ⇒ أي زائر يشغّل FFmpeg على ملفتحميل شخص آخر.
const ownJobOr403 = (req, jobId, res) => {
  const job = getJobRecord(jobId);
  if (!job) { res.status(404).json({ error: "المهمة غير موجودة" }); return false; }
  if (!ownsJob(job, req)) { denyJob(res, req); return false; }
  return true;
};

app.post("/api/convert", async (req, res) => {
  try {
    const { jobId, target } = req.body || {};
    if (!jobId || !target) return res.status(400).json({ error: "jobId و target مطلوبان" });
    if (!ownJobOr403(req, jobId, res)) return;
    res.json(await convertTo(jobId, target));
  } catch (e) { res.status(e.status || 400).json({ error: publicError(e, "فشل التحويل") }); }
});
app.post("/api/compress", async (req, res) => {
  try {
    const { jobId, crf = 28 } = req.body || {};
    if (!jobId) return res.status(400).json({ error: "jobId مطلوب" });
    if (!ownJobOr403(req, jobId, res)) return;
    res.json(await compressVideo(jobId, crf));
  } catch (e) { res.status(e.status || 400).json({ error: publicError(e, "فشل الضغط") }); }
});
app.post("/api/gif", async (req, res) => {
  try {
    const { jobId, gif } = req.body || {};
    if (!jobId) return res.status(400).json({ error: "jobId مطلوب" });
    if (!ownJobOr403(req, jobId, res)) return;
    // يقبل إمّا { jobId, ...خيارات } أو { jobId, gif: {...} } — والتقييد داخل clampGifArgs
    res.json(await videoToGif(jobId, gif || req.body || {}));
  } catch (e) { res.status(e.status || 400).json({ error: publicError(e, "فشل إنشاء GIF") }); }
});

// ── 🤖 Telegram webhook ──
// ⚠️ كان مفتوحاً لأي حدّ ⇒ أي شخص يستدعي handleTelegramUpdate ويشغّل البوت.
// التحقق: ترويسة X-Telegram-Bot-Api-Secret-Token (المعتمدة من تيليجرام).
app.post("/api/bot/telegram", (req, res) => {
  if (!telegramWebhookOk(req.headers["x-telegram-bot-api-secret-token"])) return res.sendStatus(403);
  handleTelegramUpdate(req.body || {})
    .then((r) => res.json(r))
    .catch((e) => {
      console.error("[telegram]", e?.message || e);
      res.status(500).json({ error: "فشل البوت" });
    });
});

// ── 🐞 التقاط أخطاء المتصفح (تشخيص) — بلا مصادقة عمداً ──
// ⚠️ كان ينسخ أي نص يمرّره المهاجم إلى السجل بلا تنظيف ولا حدّ: طلب واحد
// محسوب كان يكفي لتلويث سجل الأخطاء (log forging) أو ملء القرص.
// الآن: حدّ 30/10د + إزالة محارف التحكم + اقتطاع.
app.post("/api/client-error", clientErrorLimiter, (req, res) => {
  const b = req.body || {};
  const kind = clean(b.kind, 40);
  if (!kind) return res.status(204).end();
  console.error(
    `[client-error] ${kind}: ${clean(b.message, 500)}\n` +
    `  url: ${clean(b.url, 300)}\n` +
    `  stack: ${clean(b.stack, 2000)}` +
    (b.data ? `\n  data: ${clean(b.data, 500)}` : "")
  );
  res.status(204).end();
});

// ── 🧑‍💻 توثيق API العام (REST) ──
app.get("/api/docs", (req, res) => res.json({
  name: "VideoVault Pro Public API",
  version: "1.1.0",
  base: "/api",
  auth: "Authorization: Bearer <token> — مطلوب للمهام الخاصة (مستخدم) ولوحة الإدارة",
  rateLimits: {
    "/api": `${Number(process.env.API_MAX_PER_MIN || 120)}/min`,
    "/api/info|/api/download|/api/playlist": `${Number(process.env.HEAVY_MAX_PER_MIN || 15)}/min`,
    "/api/auth/*|/api/admin/login": `${Number(process.env.LOGIN_MAX_ATTEMPTS || 5)}/15min`,
    "/api/contact": `${Number(process.env.CONTACT_MAX_PER_HOUR || 5)}/hour`,
  },
  plan: "بلا حدود جودة — كل الجودات (حتى 8K) متاحة للجميع؛ حقل plan باقٍ في الأدمن كبيانات فقط",
  endpoints: [
    { method: "POST", path: "/info", body: { url: "string" }, desc: "Video preview (title, thumbnail, duration)" },
    { method: "POST", path: "/download", body: { url: "string", quality: "1080p", format: "mp4|mp3|webm|mkv|gif", password: "?", trimStart: "?", trimEnd: "?", subs: "bool", threads: "1-16", gif: "GIF_OPTS?" }, desc: "Start a download job" },
    { method: "GET", path: "/job/:id", desc: "Job status + progress + fileUrl (مهمة خاصة تتطلب توكن صاحبها)" },
    { method: "DELETE", path: "/job/:id", desc: "Cancel a running job" },
    { method: "POST", path: "/save-desktop", body: { file: "job_x.mp4" }, desc: "نسخ ملف مكتمل إلى سطح مكتب مستخدم هذا الجهاز (يتطلب ملكية المهمة)" },
    { method: "POST", path: "/playlist", body: { url: "string" }, desc: "Playlist/channel entries" },
    { method: "POST", path: "/schedule", body: { url: "string", runAt: "ISO datetime" }, desc: "Schedule a download" },
    { method: "GET", path: "/schedules", desc: "List scheduled tasks (الزائر: مهامه فقط)" },
    { method: "DELETE", path: "/schedule/:id", desc: "Cancel a scheduled task" },
    { method: "POST", path: "/convert", body: { jobId: "string", target: "mp4|mkv|webm|avi|mp3" }, desc: "Convert format (FFmpeg)" },
    { method: "POST", path: "/compress", body: { jobId: "string", crf: "18-40" }, desc: "Compress video" },
    { method: "POST", path: "/gif", body: { jobId: "string", start: "sec 0-21600", duration: "sec 1-30", width: "px 120-720", fps: "5-30", dither: "none|bayer|bayer2|fs|sierra2", loop: "0=∞|1-10", speed: "0.25-4" }, desc: "Video → animated GIF" },
    { method: "POST", path: "/contact", body: { name: "string", email: "string", message: "string" }, desc: "نموذج التواصل (5 رسائل/ساعة لكل IP)" },
    { method: "POST", path: "/auth/register", body: { email: "string", password: "4+ chars" }, desc: "تسجيل جديد ⇒ token + 50 نقطة" },
    { method: "POST", path: "/auth/login", body: { email: "string", password: "string" }, desc: "دخول ⇒ token" },
    { method: "GET", path: "/auth/me", desc: "بيانات المستخدم الحالي (يتطلب token)" },
    { method: "GET", path: "/history", desc: "سجل المستخدم الحالي فقط (الزائر: [])" },
    { method: "GET", path: "/bot/whatsapp", desc: "GET verification لـ Meta (hub.mode=subscribe)" },
    { method: "POST", path: "/bot/telegram", desc: "Telegram webhook (يتطلب X-Telegram-Bot-Api-Secret-Token)" },
    { method: "GET", path: "/health", desc: "Health check" },
  ],
}));

/**
 * GET /api/history — كان يرجع كل سجل التحميلات لأي زائر بلا مصادقة،
 * أي تسريب كامل لما شاهده/حمّله كل المستخدمين (خصوصاً أن jobId عشوائي
 * والـURL مضمَّن ⇒ تكهن بالمحتوى).
 * الآن: صاحب التوكن يرى سجله فقط، والزائر لا يرى شيئاً (وليس حتى العناوين).
 */
app.get("/api/history", async (req, res) => {
  const u = optionalUser(req);
  if (!u?.sub) return res.json([]);
  // نفس سياسة /api/job: لا نرسل userId للعميل إطلاقاً (الواجهة لا تحتاجه)
  const rows = await db.getHistoryForUser(u.sub, 100);
  res.json(rows.map(({ userId, ...pub }) => pub));
});

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    db: db.mode(),
    ytdlp: await ytdlpStatus(),
    queue: queueDepth(),
    ffmpeg: ffmpegDepth(),
  });
});

// ── لوحة الإدارة + حسابات المستخدمين ──
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);

// ── ✉️ نموذج التواصل ──
// ⚠️ messages كانت مصفوفة بلا حدّ ⇒ spam بلا حدود يستنزف الذاكرة،
// ومحتواها يُعرض للأدمن ⇒ XSS محتمل لو عُرض كـHTML لاحقاً.
const MAX_MESSAGES = 500;
app.post("/api/contact", contactLimiter, (req, res) => {
  const name = clean(req.body?.name, 80).trim();
  const email = clean(req.body?.email, 254).trim();
  const message = clean(req.body?.message, 4000).trim();
  const mail = validateEmail(email);
  if (!mail.ok || message.length < 5)
    return res.status(400).json({ error: "بريد ورسالة صالحة مطلوبة" });
  messages.unshift({ id: `m_${Date.now().toString(36)}`, name, email, message, at: Date.now() });
  if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES;
  res.json({ ok: true });
});
app.get("/api/admin/messages", requireAdmin, (req, res) => res.json(messages.slice(0, 200)));

// ── 💬 WhatsApp webhook ──
// ⚠️ POST كان مفتوحاً ⇒ أي حدّ يحوّل رابطاً عبر البوت ويشغّل yt-dlp.
app.get("/api/bot/whatsapp", (req, res) => {
  const v = verifyWhatsappWebhook(req.query);
  if (!v.ok) return res.sendStatus(403);
  res.status(200).send(v.challenge);
});
app.post("/api/bot/whatsapp", (req, res) => {
  if (!whatsappPostAllowed(req.query) || !whatsappWebhookOk(req.query)) return res.sendStatus(403);
  handleWhatsappUpdate(req.body || {})
    .then((r) => res.json(r))
    .catch((e) => {
      console.error("[whatsapp]", e?.message || e);
      res.status(500).json({ error: "فشل البوت" });
    });
});

// ملفات التحميل (تُستبدل بـ R2/S3 في الإنتاج)
app.use("/files", express.static(path.join(__dirname, "../downloads"), {
  maxAge: "1h",
  index: false,
  dotfiles: "deny",
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
}));

// ── 🧩 الواجهة المبنية (dist) ──
// في التطوير تعمل الواجهة على Vite (5173) وهذا السطر لا يُستخدم.
// في الإنتاج/خدمة Windows: عملية واحدة تخدم الواجهة والـAPI معاً، فيكفي
// منفذ واحد. المسارات غير المعروفة ترجع index.html (توجيه SPA) —
// أما /api فترجع JSON 404 لأن /api مُعالَج أعلاه.
const DIST_DIR = path.join(__dirname, "../dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    index: "index.html",
    maxAge: "1h",
    setHeaders: (res, p) => {
      // الأصول المبنية بالهاش ⇒ تخزين طويل وآمن
      if (p.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/files")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// ── 🧹 404 + معالج أخطاء موحّد (JSON دائماً تحت /api) ──
app.use("/api", (req, res) =>
  res.status(404).json({ error: `المسار غير موجود: ${req.method} ${clean(req.path, 120)}` })
);
app.use((err, req, res, _next) => {
  // ⚠️ كان يردّ err.message دائماً ⇒ تسريب مسارات داخلية وأخطاء yt-dlp/ffmpeg.
  // في الإنتاج: رسالة عامة. التفاصيل تبقى في السجل للمطوّر.
  const status = err?.status && err.status < 500 ? err.status : 500;
  if (status >= 500) console.error("[unhandled]", err?.stack || err?.message || err);
  const leak = process.env.NODE_ENV !== "production" && err?.status < 500 && err?.expose;
  const msg = leak ? String(err.message) : status >= 500 ? "خطأ داخلي في السيرفر" : "طلب غير صالح";
  res.status(status).json({ error: msg });
});

await initDb();
await restoreSchedules().catch((e) => console.error("[scheduler] فشل الاستعادة:", e.message));
startRetention(); // حذف الملفات المنتهية (قرص + روابط عامة لا تنتهي)
securityReport();
// 🔐 127.0.0.1 افتراضياً: مع nginx على نفس الجهاز لا داعي لفتح المنفذ للعالم.
//    فتحه على 0.0.0.0 يتجاوز TLS وحدود الطلبات وإعدادات الـproxy كلها، فأي-hit
//    مباشر يتخطّى nginx. ضع HOST=0.0.0.0 فقط داخل Docker/WSL الذي لا يشارك
//    شبكة المضيف مع الـproxy.
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () =>
  console.log(`✅ VideoVault API on http://${HOST}:${PORT} (db: ${db.mode()})`));
