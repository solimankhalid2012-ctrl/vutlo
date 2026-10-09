// ─────────────────────────────────────────────
// ytdlpService — محرك التحميل الحقيقي (yt-dlp)
// - بناء أوامر حقيقية: جودة/صيغة/كلمة سر/قص/ترجمة/خيوط/استئناف
// - تتبع تقدم حي عبر --newline + تحليل أسطر [download] %
// - قوائم التشغيل عبر --flat-playlist -J
// - أخطاء مفهومة بالعربية (stderr يُقرأ ويُترجم) بدل "انتهى بالكود 1"
// يتطلب على السيرفر: yt-dlp + ffmpeg في PATH (أو YTDLP_BIN في .env)
// ─────────────────────────────────────────────
import { execFile, spawn, spawnSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { db } from "./db.js"; // نقاط المكافآت عند اكتمال التحميل
import { videoToGif, FFMPEG, clampGifArgs } from "./ffmpegService.js";
import { DOWNLOAD_DIR as DOWNLOADS_DIR } from "./paths.js";
import { assertSafeHttpUrl } from "../config/ssrfGuard.js";

const exec = promisify(execFile);
const YTDLP = process.env.YTDLP_BIN || "yt-dlp";
// ⚠️ لا نمرّر --cookies-from-browser: قد يحتوي كوكيز جلسة مسروقة/خاصة،
// ويُسقط和保护 من المنع لكنه يسرّب بيانات شخصية من متصفح أي زائر.
//
const DOWNLOAD_DIR = DOWNLOADS_DIR;
// اختياري: كوكيز يوتيوب تتجاوز حظر الـIP.
// المدخلان متاحان (اختر واحداً):
//   YTDLP_COOKIES      = مسار ملف cookies.txt داخل الصورة (يَنْشُر حسابك في
//                        المستودع العام إن وُضع فيه — غير محبّذ!)
//   YTDLP_COOKIES_B64  = محتوى cookies.txt معرفاً base64 — الآمن: يُفك إلى
//                        ملف في /tmp عند الإقلاع، فلا تُنشر بيانات جلستك أبداً.
const COOKIES = (() => {
  const raw = (process.env.YTDLP_COOKIES_B64 || "").replace(/\s+/g, "");
  if (raw) {
    try {
      const f = path.join(os.tmpdir(), `vutlo-cookies-${process.pid}.txt`);
      fs.writeFileSync(f, Buffer.from(raw, "base64").toString("utf8"), "utf8");
      return f;
    } catch {
      console.error("[yt-dlp] تعذّر فك YTDLP_COOKIES_B64 — تابع بلا كوكيز");
      return "";
    }
  }
  return process.env.YTDLP_COOKIES || "";
})();
// محرّك JavaScript الذي يستخدمه yt-dlp لفك تشفير التواقيع (n-sig).
// بدونه يفشل يوتيوب برسالة "The page needs to be reloaded".
// Node مثبّت عادةً؛ يمكن تغييره أو تعطيله عبر YTDLP_JS_RUNTIME=none
const JS_RUNTIME = (process.env.YTDLP_JS_RUNTIME || "node").trim();
const jsRuntimeArgs = () =>
  !JS_RUNTIME || JS_RUNTIME.toLowerCase() === "none" ? [] : ["--js-runtimes", JS_RUNTIME];

// 🕵️ وكيل اختياري (YTDLP_PROXY=http://user:pass@host:port) — مفيد عندما
// يحجب مزود الاستضافة (مثل مراكز بيانات Render) IP السيرفر على يوتيوب:
// يُمرَّر إلى yt-dlp عبر --proxy دون تغيير أي منطق.
const PROXY = process.env.YTDLP_PROXY || "";
const proxyArgs = () => (PROXY ? ["--proxy", PROXY] : []);

// 🚀 aria2c: سكربت تنزيل خارجي يجزّئ الملف إلى اتصالات متوازية (-x / -s 16).
// متوفّر محلياً في bin/aria2c (يُشحن مع المشروع) أو في PATH. يضاعف سرعة
// التحميلات التي ترسلها المنصات كملفٍ واحد — الحالة التي لا يساعدها
// --concurrent-fragments (خاصّ بمقاطع HLS/DASH المجزّأة فقط).
let _aria2c;
export function aria2cCommand() {
  if (_aria2c !== undefined) return _aria2c;
  const local = path.join(process.cwd(), "bin", "aria2c", process.platform === "win32" ? "aria2c.exe" : "aria2c");
  const ok = (cmd) => {
    try { return spawnSync(cmd, ["--version"], { windowsHide: true, stdio: "ignore" }).status === 0; }
    catch { return false; }
  };
  _aria2c = ok(local) ? local : (ok("aria2c") ? "aria2c" : "");
  return _aria2c;
}
/** وسائط aria2c: جزءّي الملف إلى n اتصالاً (مع حد أدنى للجزء كي لا يفشل على الملفات الصغيرة). */
const aria2Args = (n) => ["--downloader", "aria2c", "--downloader-args", `aria2c:-x ${n} -s ${n} --min-split-size=1M`];

// عملاء يوتيوب تُجرَّب بالترتيب عند فشل يوتيوب (bot check / 429 / 403).
// الأول هو الافتراضي (بلا تحديد). عملاء embedded/android أضيفوا أولاً بعد
// الافتراضي لأنهم يجتازون فحص "Sign in to confirm you're not a bot" في
// مراكز البيانات غالباً بلا كوكيز، و tv/web_safari شبكة أمان أوسع.
const YT_FALLBACKS = [
  [],
  ["--extractor-args", "youtube:player_client=android_embedded"],
  ["--extractor-args", "youtube:player_client=web_embedded"],
  ["--extractor-args", "youtube:player_client=tv"],
  ["--extractor-args", "youtube:player_client=web_safari"],
];

/** هل هذا خطأ حظر من يوتيوب (يستحق إعادة المحاولة بعميل آخر)؟ */
export function isUpstreamBlock(raw) {
  // ملاحظة: لا نضع "unavailable" هنا عن قصد — فيديو محذوف/خاص خطأ دائم،
  // وإعادة المحاولة عليه تضيّع ~45 ثانية قبل إعطاء نفس النتيجة النهائية.
  return /429|Too Many Requests|HTTP Error 403|Forbidden|not a bot|Sign in to confirm|nsig|PO Token|The page needs to be reloaded|Unable to extract (player|initial data|video)|Failed to extract (any )?player/i.test(String(raw || ""));
}

// (إنشاء مجلد التنزيل يتم في services/paths.js — مصدر واحد للجميع)

// مخزن المهام في الذاكرة (الإنتاج: Redis/BullMQ + PostgreSQL)
const jobs = new Map();
const JOB_TTL = 1000 * 60 * 60; // ساعة — تُنظَّف المهام المنتهية
const MAX_JOBS = 200;
/** أقصى عدد عمليات yt-dlp متزامنة. كان معرّفاً في .env بلا أي استخدام فعلي. */
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT) || 4);

// الجودة ← أقصى ارتفاع
const HEIGHT = {
  "144p": 144, "240p": 240, "360p": 360, "480p": 480,
  "720p": 720, "1080p": 1080, "1440p": 1440,
  "2160p (4K)": 2160, "2160p": 2160, "4K": 2160,
  "4320p (8K)": 4320, "4320p": 4320, "8K": 4320,
};

/** ارتفاع الجودة بالأرقام (لحدّ الخطة المجانية) */
export function qualityHeight(quality) {
  return HEIGHT[quality] ?? 1080;
}

/**
 * محدد متساهل بلا تقييد ارتفاع — شبكة أمان عندما لا تتوفر الصيغة/الجودة
 * المطلوبة لهذا الفيديو تحديداً (يحدث مع الفيديوهات القديمة أو القصيرة).
 * ⚠️ كان "bv*+ba" فيختار AV1/VP9 أيضاً فنُخرج ملفاً غير قابل للتشغيل على
 * أجهزة كثيرة ⇒ نفضّل avc1/mp4 هنا أيضاً.
 */
export function permissiveSelector(format) {
  if (format === "mp3") return "ba/b";
  if (format === "mp4") return "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio/bestvideo+bestaudio/best";
  return "bestvideo+bestaudio/best";
}

/** يستبدل قيمة -f في مصفوفة الوسائط بمحدد متساهل (ويبقي كل شيء آخر) */
export function relaxFormatArgs(args, format) {
  const i = args.indexOf("-f");
  if (i === -1 || i === args.length - 1) return args;
  const next = [...args];
  next[i + 1] = permissiveSelector(format);
  return next;
}

/** هل فشل لأن الصيغة/الجودة المطلوبة غير متاحة لهذا الفيديو؟ */
export function isFormatUnavailable(raw) {
  return /Requested format is not available/i.test(String(raw || ""));
}

/**
 * يستخرج نسبة التقدّم من سطر yt-dlp ويمنع التراجع.
 * يلتقط أيضاً الحجم/السرعة/المتبقّي (progressInfo) ليُعرض حيّاً للمستخدم —
 * فعندما لا يتحرك الشريط يرى أن البيانات تنساب فعلاً (أو يتوقف الحارس).
 *
 * تنزيل الفيديو والصوت يتم كتدفّقين منفصلين، وكلٌّ يطبع نسبته من 0% ⇒ بلا
 * حارس الرتابة تقفز النسبة إلى الخلف (81% ثم 61%) وتبدو للمستخدم معطوبة.
 * يبقى السقف 99% لأن 100% تُضبط في finishJob بعد اكتمال الدمج فعلياً.
 */
export function parseProgress(job, line) {
  const m = /\[download\]\s*(\d+(?:\.\d+)?)%(?: of\s+(?:~\s*)?([\d.]+\s*\S+))?(?: at\s+([\d.]+\s*\S+))?(?:\s+ETA\s+(\d{1,2}:\d{2}))?/.exec(String(line));
  if (!m) return false;
  const p = Math.min(99, parseFloat(m[1]));
  if (p > job.progress) job.progress = p;
  job.progressInfo = job.progressInfo || {};
  if (m[2]) job.progressInfo.size = m[2];
  if (m[3]) job.progressInfo.speed = m[3];
  if (m[4]) job.progressInfo.eta = m[4];
  if (p > job.progressInfo.pct || job.progressInfo.pct === undefined) job.progressInfo.pct = p;
  return true;
}

/**
 * توحيد صيغة وقت القص إلى ثوانٍ.
 * يقبل: "12" أو 12 أو "1:05" أو "01:02:03" ← يُرجع دائماً ثوانٍ.
 * يرجع null عند صيغة غير صالحة (فيُرفض بـ 400 بدل تمريرها لـ yt-dlp).
 */
export function toSeconds(value) {
  if (value === "" || value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "") return "";
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  const m = /^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (!m) return null;
  const [_, a, b, c] = m;
  // صيغة hh:mm:ss أو mm:ss
  const total = c !== undefined
    ? parseInt(a, 10) * 3600 + parseInt(b, 10) * 60 + parseInt(c, 10)
    : parseInt(a, 10) * 60 + parseInt(b, 10);
  return String(total);
}

/**
 * روابط http/https فقط + حارس SSRF (انظر config/ssrfGuard.js):
 * - يمنع loopback/الشبكة الداخلية/الميتاداتا مهما كان شكل التهريب.
 * - fail-closed: الرابط الذي لا يمكن التحقق منه يُرفض.
 * الواجهة غير متزامنة لأن التحقق يتطلب حلّ DNS.
 */
export async function assertUrl(url) {
  const u = String(url || "").trim();
  if (!u) throw httpError(400, "رابط مفقود");
  try {
    return await assertSafeHttpUrl(u);
  } catch (e) {
    throw httpError(400, e?.expose ? e.message : "رابط غير مسموح");
  }
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  // كل رسائل httpError مكتوبة بيدنا ومترجَمة ⇒ آمنة للعرض.
  // ما ليس منها (أخطاء exec/Prisma) يبقى في السجل (expose غير مضبوط).
  e.expose = true;
  return e;
}

/** ترجمة أخطاء yt-dlp الشائعة إلى رسائل مفهومة + سبب الحل */
export function explainFailure(raw, code) {
  const t = String(raw || "");
  const pick = (re, msg) => (re.test(t) ? msg : null);
  return (
    pick(/Sign in to confirm you'?re not a bot|confirm your age/i,
      "يوتيوب طلب تحقق (Bot Check) — جرّب لاحقاً أو فعّل JS runtime (Deno) على السيرفر") ||
    pick(/429|Too Many Requests/i,
      "يوتيوب حظر عنوان السيرفر مؤقتاً (429) — انتظر 10-30 دقيقة، أو فعّل كوكيز عبر YTDLP_COOKIES في .env") ||
    pick(/Video unavailable|This video is private|Private video/i,
      "الفيديو غير متاح أو خاص") ||
    pick(/members-only|Join this channel/i, "الفيديو للأعضاء فقط — يحتاج اشتراك القناة") ||
    pick(/age.?restricted|inappropriate for some users/i, "الفيديو مقيّد بالعمر — يحتاج كلمة سر أو حساب") ||
    pick(/Requested format is not available/i, "الجودة/الصيغة المطلوبة غير متاحة لهذا الفيديو — جرّب جودة أقل") ||
    pick(/Unsupported URL|No video formats found/i, "الرابط غير مدعوم أو لا يحتوي فيديو قابل للتحميل") ||
    pick(/is not a valid URL|Unable to parse URL/i, "الرابط غير صالح") ||
    pick(/ffmpeg (is )?not (installed|found)|ffmpeg.*not found/i,
      "FFmpeg غير مثبّت على السيرفر — ضروري للدمج وتحويل MP3/GIF") ||
    pick(/The page needs to be reloaded|unable to extract yt initial data/i,
      "فشل فك تشفير يوتيوب (يلزم محرّك JS) — تأكد من ضبط YTDLP_JS_RUNTIME=node في .env") ||
    pick(/Unable to extract (player|initial data|video)/i,
      "تعذّر استخراج بيانات يوتيوب — جرّب لاحقاً أو فعّل الكوكيز عبر YTDLP_COOKIES") ||
    pick(/HTTP Error 403|Forbidden/i,
      COOKIES
        ? "رفض الموقع الطلب (403) رغم وجود الكوكيز — غالباً محتوى محمي أو Fighter Quarantine؛ جرّب رابطاً آخر"
        : "رفض يوتيوب الطلب (403) بعد كل المحاولات — فعّل كوكيز عبر YTDLP_COOKIES في ملف .env لتجاوز فحص البوت") ||
    pick(/HTTP Error 404|Not Found/i, "الصفحة غير موجودة (404) — تحقق من الرابط") ||
    pick(/DNS|name or service not known|getaddrinfo/i, "تعذّر الوصول للموقع — تحقق من الإنترنت على السيرفر") ||
    pick(/No space left on device/i, "لا توجد مساحة كافية على قرص السيرفر") ||
    pick(/readable files|Could not find.*js runtime/i, "يلزم JS runtime (Deno) لاستخراج يوتيوب بثبات") ||
    (code === 1 ? "فشل التحميل — " + lastMeaningfulLine(t) : "") ||
    (code ? `انتهى yt-dlp بالكود ${code}` : "فشل التحميل") ||
    "فشل التحميل"
  );
}

function lastMeaningfulLine(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const err = lines.filter((l) => /^error|^ERROR|^\[error/i.test(l)).pop();
  return (err || lines.pop() || "سبب غير معروف").slice(0, 220);
}

/** هل الأداة متاحة ونشطة؟ (لعرض حالة واضحة بدل الأخطاء الغامضة) */
export async function ytdlpStatus() {
  try {
    const { stdout } = await exec(YTDLP, ["--version"], { timeout: 8000 });
    return { ok: true, version: String(stdout).trim(), bin: YTDLP };
  } catch (e) {
    return { ok: false, version: null, bin: YTDLP, reason: e.code === "ENOENT" ? "غير مثبّت/غير موجود في PATH" : e.message };
  }
}

/**
 * بناء وسائط yt-dlp الحقيقية من خيارات المستخدم
 * @returns {string[]} مصفوفة الوسائط (بدون الرابط)
 */
export function buildYtdlpArgs(jobId, {
  quality = "1080p", format = "mp4",
  password = "", trimStart = "", trimEnd = "",
  subs = false, threads = 16,
} = {}) {
  const h = HEIGHT[quality] ?? 1080;
  if (!["mp4", "webm", "mkv", "mp3", "gif"].includes(format))
    throw httpError(400, `صيغة غير مدعومة: ${format}`);
  const out = path.join(DOWNLOAD_DIR, `${jobId}.%(ext)s`);
  const n = Math.min(Math.max(Number(threads) || 8, 1), 16);
  // 🚀 مع aria2c: نخفّف --concurrent-fragments ولا فائدة من إيقافه،
  // لكن التجزئة الحقيقية للملف الواحد تصبح على عاتق aria2c (-x/-s).
  const args = [
    "--newline", "--progress", "--no-warnings", "--no-playlist",
    "--concurrent-fragments", String(n),
    ...(aria2cCommand() ? aria2Args(n) : []),
    "--retries", "10", "--fragment-retries", "10",
    "--extractor-retries", "5", "--retry-sleep", "linear=1::5",
    "--socket-timeout", "30",
    "--continue", // ⏸️ استئناف التحميل بعد الانقطاع
// بلا محرّك JS يفشل يوتيوب برسالة "The page needs to be reloaded"
    ...jsRuntimeArgs(),
    ...proxyArgs(),
    "-o", out,
  ];
  // 🍪 كوكيز يوتيوب (اختياري) — تساعد على تجاوز حظر الـIP
  if (COOKIES) args.push("--cookies", COOKIES);
  // 🔧مرّر مسار ffmpeg صراحةً: الدمج (bv*+ba) و MP3/GIF يعتمدان عليه،
  // وقد لا يكون ffmpeg في PATH عند تشغيل السيرفر كخدمة Windows.
  if (FFMPEG && FFMPEG !== "ffmpeg") args.push("--ffmpeg-location", FFMPEG);

  if (format === "mp3") {
    // 🎧 استخراج الصوت 320kbps — تحميل الصوت فقط (لا تنزيل الفيديو كاملاً)
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "320K");
  } else if (format === "gif") {
    // 🎞️ نحمّل نسخة صغيرة ثم نحوّلها GIF عبر FFmpeg بعد الانتهاء
    args.push("-f", `bv*[height<=${Math.min(h, 480)}]+ba/b[height<=${Math.min(h, 480)}]/b`);
    args.push("--merge-output-format", "mp4");
  } else {
    // 🎬 فيديو: أفضل صورة ≤ الارتفاع + أفضل صوت ثم دمج.
    // ⚠️ كان "bv*[height<=H]+ba" ⇒ يختار yt-dlp ترميز AV1/VP9-efficient لأنها
    // أصغر حجماً، فيخرج ملف 1080p بترميز av1 داخل حاوية mp4: جودته النهائية
    // سيئة على أي جهاز لا يدعم AV1 (معظم مشغّلات Windows والهواتف)، ويبدو
    // للمستخدم "محطّم/ضعيف". نطلب avc1 (H.264) داخل mp4 أولاً لأنها المرجع
    // الذي يشغّله كل جهاز، ونترك البدائل خلفها.
    const cont = ["mp4", "webm", "mkv"].includes(format) ? format : "mp4";
    const vcodec = format === "mp4" ? "[vcodec^=avc1][ext=mp4]" : "";
    // الصوت: m4a/AAC داخل mp4 هو الأوسع توافقاً (opus داخل mp4 لا يشغّله
    // QuickTime وأجزاء من أندرويد). نفضّله ثم نترك ba/b behindه.
    const audio = format === "mp4" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio";
    args.push(
      "-f",
      // 1) avc1/mp4 + m4a (الأوسع توافقاً)  2) أي ترميز بنفس الارتفاع  3) best المدمج
      `bestvideo${vcodec}[height<=${h}]+${audio}/bestvideo[height<=${h}]+${audio}/best[height<=${h}]`,
    );
    args.push("--merge-output-format", cont);
  }

  if (password) args.push("--video-password", password); // 🔑 روابط محمية
  if (trimStart !== "" || trimEnd !== "") {
    // ✂️ قص قبل التحميل: --download-sections "*10-60"
    const s = toSeconds(trimStart);
    const e = toSeconds(trimEnd);
    if (s === null || e === null) throw httpError(400, "أوقات القص يجب أن تكون أرقاماً (بالثواني أو بصيغة mm:ss)");
    if (s !== "" && e !== "" && Number(s) >= Number(e)) throw httpError(400, "بداية القص يجب أن تكون قبل نهايته");
    args.push("--download-sections", `*${s}-${e}`);
  }
  if (subs && format !== "mp3") {
    // 💬 دمج الترجمة
    args.push("--write-subs", "--write-auto-subs", "--sub-langs", "all", "--embed-subs");
  }
  return args;
}

/**
 * جلب معلومات فيديو — مع كاش 10 دقائق وتبديل عميل يوتيوب عند فشل yt-dlp
 * الكاش يخفّض الضغط على يوتيوب ويمنع أخطاء 429 الناتجة عن تكرار الطلبات
 */
const infoCache = new Map();
const INFO_TTL = 10 * 60_000;
const INFO_CACHE_MAX = 200;

export async function getVideoInfo(url) {
  const safe = await assertUrl(url);
  const hit = infoCache.get(safe);
  if (hit && Date.now() - hit.at < INFO_TTL) return hit.data;

  let lastErr = null;
  for (const extra of YT_FALLBACKS) {
    try {
      const args = ["--dump-json", "--no-playlist", "--no-warnings", "--socket-timeout", "20", ...jsRuntimeArgs(), ...proxyArgs(), ...(COOKIES ? ["--cookies", COOKIES] : []), ...extra, safe];
      const { stdout } = await exec(YTDLP, args, { timeout: 40000, maxBuffer: 16 * 1024 * 1024 });
      const data = JSON.parse(stdout.split("\n").filter(Boolean)[0]);
      const info = {
        id: data.id, title: data.title || "Untitled",
        uploader: data.uploader || data.channel || "",
        duration: formatDuration(data.duration), durationSec: data.duration || 0,
        thumbnail: data.thumbnail || "", extractor: data.extractor || "",
        formats: (data.formats || []).slice(-12).map((f) => ({ id: f.format_id, ext: f.ext, height: f.height, filesize: f.filesize })),
        isPlaylist: false,
      };
      if (infoCache.size >= INFO_CACHE_MAX) infoCache.delete(infoCache.keys().next().value);
      infoCache.set(safe, { at: Date.now(), data: info });
      return info;
    } catch (e) {
      lastErr = e;
      // لا نُعيد المحاولة إلا لأخطاء يوتيوب المؤقتة
      if (!isUpstreamBlock(e.stderr)) break;
    }
  }
  const stderr = lastErr?.stderr || "";
  const message = lastErr?.code === "ENOENT"
    ? "yt-dlp غير مثبّت على السيرفر — اضبط YTDLP_BIN في .env"
    : explainFailure(stderr, lastErr?.code);
  console.error("[yt-dlp info] failed:", message);
  throw httpError(422, message);
}

/** 📃 معلومات قائمة تشغيل/قناة (سريع عبر flat-playlist) */
export async function getPlaylist(url) {
  const safe = await assertUrl(url);
  try {
    const { stdout } = await exec(
      YTDLP, ["--flat-playlist", "-J", "--no-warnings", ...jsRuntimeArgs(), ...proxyArgs(), ...(COOKIES ? ["--cookies", COOKIES] : []), safe],
      { timeout: 60000, maxBuffer: 32 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout);
    const entries = (data.entries || []).filter(Boolean).map((e) => ({
      id: e.id, title: e.title || e.id,
      url: e.url || e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : ""),
      duration: e.duration || 0,
    }));
    if (!entries.length) throw httpError(422, "لم يُعثر على فيديوهات في هذا الرابط");
    return { title: data.title || "Playlist", count: entries.length, entries };
  } catch (e) {
    if (e.status) throw e;
    const message = e.code === "ENOENT"
      ? "yt-dlp غير مثبّت على السيرفر — اضبط YTDLP_BIN في .env"
      : explainFailure(e.stderr || "", e.code);
    console.error("[yt-dlp playlist] failed:", message);
    throw httpError(422, message);
  }
}

/** بدء مهمة تحميل حقيقية (تعمل في الخلفية، تُراقب عبر GET /api/job/:id) */
export async function queueDownload(url, opts = {}) {
  const safe = await assertUrl(url);
  const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const args = buildYtdlpArgs(jobId, opts);
  const job = {
    jobId, url: safe, status: "queued", stage: "queued", progress: 0,
    quality: opts.quality || "1080p", format: opts.format || "mp4",
    // 🎞️ خيارات GIF التي اختارها المستخدم — تُستخدم بعد انتهاء التنزيل.
    // ⚠️ كانت hardcoded ({0, 4s, 480}) ⇒ كل خيارات المستخدم في الواجهة بلا أثر!
    gif: opts.format === "gif" ? clampGifArgs(opts.gif || {}) : null,
    file: null, fileName: null, fileUrl: null, size: 0, error: null, notice: null,
    progressInfo: { pct: 0, size: null, speed: null, eta: null },
    userId: opts.userId || null, createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  pruneJobs();
  runJob(job, args); // fire-and-forget
  return {
    jobId, status: job.status, quality: job.quality, format: job.format,
    message: job.format === "mp3"
      ? "🎧 سيُستخرج الصوت بجودة 320kbps عبر FFmpeg"
      : job.format === "gif"
        ? "🎞️ سيُحمّل مقطع قصير ثم يتحول إلى GIF"
        : "✨ ستُزال العلامة المائية تلقائياً (TikTok/Reels/Shorts)",
  };
}

/**
 * طابور تنفيذ بحدّ تزامن حقيقي.
 * MAX_CONCURRENT كان معرّفاً في .env لكنه غير مستخدم إطلاقاً — أي عدد غير
 * محدود من عمليات yt-dlp كان ينطلق دفعةً واحدة (استنزاف CPU/ذاكرة + حظر IP من يوتيوب).
 */
let activeCount = 0;
const waiting = [];

function pumpQueue() {
  while (activeCount < MAX_CONCURRENT && waiting.length) {
    const     next = waiting.shift();
    activeCount++;
    _slots.add(next.job.jobId);
    runAttempt(next.job, next.args, 0);
  }
}

export function queueDepth() {
  return { active: activeCount, waiting: waiting.length, max: MAX_CONCURRENT };
}

/**
 * يحرّر خانة التزامن لمهمة انتهت (نجاح/خطأ/إلغاء) ويشغّل التالي في الطابور.
 * _slots تمنع التحرير المزدوج (خطأ ثم close مثلاً) ⇒ لا يبقى العدّاد خاطئاً.
 */
const _slots = new Set();
function releaseSlot(jobId) {
  if (!jobId || !_slots.delete(jobId)) return;
  activeCount = Math.max(0, activeCount - 1);
  pumpQueue();
}

/** الطابور ينتظر: نُبقي المهمة فيه حتى تحرّر خانة */
function enqueue(job, args) {
  job.status = "queued";
  job.stage = "waiting";
  waiting.push({ job, args });
}

function runJob(job, args) {
  if (activeCount >= MAX_CONCURRENT) return enqueue(job, args);
  activeCount++;
  _slots.add(job.jobId);
  runAttempt(job, args, 0);
}

/**_backoff بالثواني لكل محاولة */
const BACKOFF = [0, 4_000, 12_000, 30_000];

/**
 * محاولة واحدة: تشغيل yt-dlp بعميل يوتيوب محدد.
 * عند فشل بسبب حظر يوتيوب (403/429/bot check) نعيد المحاولة
 * بعميل بديل مع تراجع تصاعدي بدل إظهار الخطأ للمستخدم مباشرة.
 */
function runAttempt(job, args, attempt) {
  job.status = "downloading";
  job.stage = "downloading";
  job.attempt = attempt + 1;
  job.notice = null;
  job.progressInfo = { pct: 0, size: null, speed: null, eta: null };
  const stderrTail = [];
  let child;
  try {
    // "--" يمنع تفسير الرابط كخيار إن بدأ بشرطة
    const client = YT_FALLBACKS[attempt] || YT_FALLBACKS[0];
    child = spawn(YTDLP, [...args, ...client, "--", job.url], {
      timeout: 1000 * 60 * 60,
      windowsHide: true,
    });
  } catch (e) {
    job.status = "error"; job.error = e.code === "ENOENT" ? "yt-dlp غير مثبّت على السيرفر" : String(e.message);
    return;
  }
  job.child = child;

  /* ⏰ حارس التجمّد: يوتيوب أحياناً يقطع الاتصال بصمت بلا أي سطر خروج —
     كان التحميل يعلق "جارٍ التحميل" بنسبة 0% حتى ساعة كاملة بلا تفسير.
     إذا مرّ STALL_MS بلا أي إخراج (نحن في مرحلة التنزيل فقط، لا المعالجة
     لأن الدمج/التحويل يعمل بصمت وقد يطول) → نوقفه ونعيد المحاولة بعميل بديل. */
  const STALL_MS = 120000;
  let lastLineAt = Date.now();
  job.stallTimer = setInterval(() => {
    if (job.child !== child || job.status !== "downloading") return;
    if (job.stage !== "downloading") return;
    if (Date.now() - lastLineAt <= STALL_MS) return;
    job.stalled = true;
    console.warn(`[job ${job.jobId}] لا بيانات من الموقع منذ ${STALL_MS / 1000}s — إيقاف ومحاولة عميل بديل`);
    try { child.kill("SIGKILL"); } catch { /* قد يكون انتهى قبل الكيل */ }
  }, 10000);

  const onData = (d) => {
    lastLineAt = Date.now();
    const text = String(d);
    for (const line of text.split(/\r?\n/)) {
      if (parseProgress(job, line)) continue;
      if (/\[Merger\]|\[ExtractAudio\]|\[Metadata\]|\[Fixups\]|\[EmbedSubtitle\]|\[VideoConvertor\]/.test(line)) {
        job.stage = "processing"; // مرحلة ما بعد التحميل (دمج/صوت/ترجمة)
        continue;
      }
      if (/^\s*(ERROR|WARNING):/.test(line) && stderrTail.length < 40) stderrTail.push(line.trim());
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("error", (e) => {
    job.status = "error";
    job.error = e.code === "ENOENT" ? "yt-dlp غير مثبّت على السيرفر — اضبط YTDLP_BIN في .env" : String(e.message);
    releaseSlot(job.jobId);
  });

  child.on("close", (code, signal) => {
    delete job.child;
    if (job.stallTimer) { clearInterval(job.stallTimer); delete job.stallTimer; }
    if (job.status === "cancelled") { releaseSlot(job.jobId); return; }
    if (code === 0) {
      finishJob(job, stderrTail).catch((e) => {
        job.status = "error";
        job.error = e.message || "فشل إنهاء الملف";
      }).finally(() => releaseSlot(job.jobId));
      return;
    }
    if (job.status === "error") { releaseSlot(job.jobId); return; }
    if (signal === "SIGTERM" || signal === "SIGKILL") {
      // 🔄 تجمّد/قتل من حارس التجمّد ⇒ إعادة محاولة بعميل بديل قبل إظهار الخطأ
      if (job.stalled) {
        delete job.stalled;
        if (attempt + 1 < YT_FALLBACKS.length) {
          job.stage = "retrying";
          job.progress = 0;
          job.progressInfo = { pct: 0, size: null, speed: null, eta: null };
          job.error = null;
          job.notice = `التحميل تجمّد (الموقع توقف عن الإرسال) — إعادة محاولة بعميل بديل (${attempt + 2}/${YT_FALLBACKS.length})`;
          job.retryTimer = setTimeout(() => {
            delete job.retryTimer;
            if (job.status !== "cancelled") runAttempt(job, args, attempt + 1);
          }, 2000);
          return;
        }
        job.status = "error";
        job.error = "توقّف مصدر الفيديو عن إرسال البيانات ولم تنجح المحاولات — جرّب لاحقاً أو رابطاً آخر";
        releaseSlot(job.jobId);
        return;
      }
      job.status = "error";
      job.error = "أُلغيت المهمة";
      releaseSlot(job.jobId);
      return;
    }

    // 🔄 يوتيوب رفض العميل الحالي؟ جرّب عميلاً بديلاً قبل إظهار الخطأ
    const raw = stderrTail.join("\n");

    // 🎯 الجودة/الصيغة غير متاحة لهذا الفيديو → إعادة محاولة واحدة بمحدد
    // متساهل (أفضل صيغة موجودة) بدل إظهار خطأ للمستخدم.
    if (!job.formatRelaxed && isFormatUnavailable(raw)) {
      const relaxed = relaxFormatArgs(args, job.format);
      if (relaxed !== args) {
        job.formatRelaxed = true;
        job.stage = "retrying";
        job.progress = 0;
        job.progressInfo = { pct: 0, size: null, speed: null, eta: null };
        job.error = null;
        job.notice = "الجودة المطلوبة غير متاحة لهذا الفيديو — جارٍ التحميل بأفضل صيغة متاحة";
        console.warn(`[job ${job.jobId}] الصيغة غير متاحة — إعادة محاولة بمحدد متساهل`);
        job.retryTimer = setTimeout(() => {
          delete job.retryTimer;
          if (job.status !== "cancelled") runAttempt(job, relaxed, attempt);
        }, 300);
        return;
      }
    }

    if (attempt + 1 < YT_FALLBACKS.length && isUpstreamBlock(raw)) {
      const wait = BACKOFF[Math.min(attempt + 1, BACKOFF.length - 1)];
      job.stage = "retrying";
      job.progress = 0;
      job.progressInfo = { pct: 0, size: null, speed: null, eta: null };
      job.error = null;
      job.notice = `يوتيوب حظر المحاولة ${attempt + 1} — إعادة محاولة بعميل بديل بعد ${Math.round(wait / 1000)} ثانية`;
      console.warn(`[job ${job.jobId}] يوتيوب رفض المحاولة ${attempt + 1} — إعادة محاولة بعميل بديل بعد ${wait / 1000}s`);
      job.retryTimer = setTimeout(() => {
        delete job.retryTimer;
        if (job.status !== "cancelled") runAttempt(job, args, attempt + 1);
      }, wait);
      return;
    }

    job.status = "error";
    job.error = explainFailure(raw, code);
    console.error(`[job ${job.jobId}] failed (${code}):`, job.error);
    releaseSlot(job.jobId);
  });
}

/** إنهاء المهمة: يجد الملف، ويحوّله إلى GIF إن لزم، ويسجّل الحجم */
async function finishJob(job, stderrTail) {
  let file = findJobFile(job.jobId);
  if (!file) {
    job.status = "error";
    job.error = explainFailure(stderrTail.join("\n"), 0) || "اكتمل yt-dlp لكن لم يُنتج ملفاً";
    return;
  }
  if (job.format === "gif") {
    job.stage = "processing";
    try {
      // 🎞️ نحوّل المقطع المنزَّل إلى GIF بنفس خيارات المستخدم (start/duration/
      // width/fps/dither/loop/speed) — مُقيَّدة بـ clampGifArgs عند إنشاء المهمة.
      const g = await videoToGif(job.jobId, job.gif || {});
      file = g.file;
    } catch (e) {
      job.status = "error";
      job.error = "تعذّر تحويل الفيديو إلى GIF: " + (e.message || "خطأ FFmpeg");
      return;
    }
  }
  let size = 0;
  try { size = fs.statSync(file).size; } catch {}
  job.status = "done";
  job.stage = "done";
  job.progress = 100;
  job.file = file;
  job.fileName = path.basename(file);
  job.fileUrl = `/files/${path.basename(file)}`;
  job.size = size;
  if (job.userId) await db.addPoints(job.userId, 10).catch(() => {}); // 🏆 +10 لكل تحميل مكتمل
  const meta = await previewMeta(job.url);
  await db.logHistory({ url: job.url, title: meta.title, thumbnail: meta.thumbnail, kind: "download", format: job.format, quality: job.quality, status: "done", userId: job.userId || null }).catch(() => {});
}

/** نعيد استخدام العنوان/الصورة من المعاينة السابقة لنفس الرابط حتى لا يبقى السجل فارغاً */
async function previewMeta(url) {
  try {
    const recent = (await db.getHistory(30)) || [];
    const hit = recent.find((h) => h.url === url && h.title);
    return { title: hit?.title || "", thumbnail: hit?.thumbnail || "" };
  } catch { return { title: "", thumbnail: "" }; }
}

/** ❌ إلغاء مهمة جارية (أثناء التنزيل أو أثناء انتظار إعادة المحاولة) */
export function cancelJob(id) {
  const j = jobs.get(id);
  if (!j) return false;
  if (["done", "error", "cancelled"].includes(j.status)) return false;
  // إن كانت في طابور الانتظار ⇒ أخرجها منه (وإلا شغلتها الخانة لاحقاً)
  const qi = waiting.findIndex((w) => w.job.jobId === id);
  if (qi !== -1) {
    waiting.splice(qi, 1);
    j.status = "cancelled";
    j.stage = "cancelled";
    j.error = "أُلغيت المهمة";
    return true;
  }
  if (j.retryTimer) {
    clearTimeout(j.retryTimer);
    delete j.retryTimer;
    j.status = "cancelled";
    j.stage = "cancelled";
    j.error = "أُلغيت المهمة";
    cleanupPartials(j.jobId);
    releaseSlot(j.jobId);
    return true;
  }
  if (j.child) {
    j.status = "cancelled";
    j.stage = "cancelled";
    j.error = "أُلغيت المهمة";
    try { j.child.kill("SIGTERM"); } catch {}
    setTimeout(() => {
      try { j.child?.kill("SIGKILL"); } catch {}
      cleanupPartials(j.jobId);
    }, 3000).unref?.();
    return true;
  }
  j.status = "cancelled";
  j.stage = "cancelled";
  j.error = "أُلغيت المهمة";
  cleanupPartials(j.jobId);
  releaseSlot(j.jobId);
  return true;
}

/** حذف الملفات الناقصة (.part) حتى لا تتراكم مساحة القرص */
function cleanupPartials(jobId) {
  try {
    for (const f of fs.readdirSync(DOWNLOAD_DIR)) {
      if (f.startsWith(jobId + ".") && (f.endsWith(".part") || f.endsWith(".ytdl"))) {
        try { fs.unlinkSync(path.join(DOWNLOAD_DIR, f)); } catch {}
      }
    }
  } catch {}
}

/** الإصدار العام للمهمة — نقطة واحدة للتسلسل.
 *  نستبعد: child (عملية yt-dlp حيّة)، retryTimer و stallTimer (كائنات Node حيّة،
 *  و JSON.stringify عليها يرمي "Converting circular structure to JSON" فيفشل
 *  /api/job/:id و /api/admin/jobs)، و userId (لا يُعرض للعملاء). */
export function publicJob(j) {
  const { child, retryTimer, stallTimer, userId, ...pub } = j;
  return pub;
}

/** حالة مهمة */
export function getJob(id) {
  const j = jobs.get(id);
  return j ? publicJob(j) : null;
}

/**
 * السجل الداخلي (يحتوي userId) — للتحقق من الملكية داخل السيرفر فقط.
 * لا يُرسل للعميل أبداً؛ للرد العام استخدم getJob.
 */
export function getJobRecord(id) {
  return jobs.get(id) || null;
}

function findJobFile(jobId) {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.startsWith(jobId + ".") && !f.endsWith(".part"));
    if (!files.length) return null;
    return path.join(DOWNLOAD_DIR, files.sort().at(-1));
  } catch { return null; }
}

/** قائمة كل المهام (للوحة الإدارة) — عبر publicJob حتى لا يتسرّب retryTimer */
export function listJobs() {
  return [...jobs.values()].map(publicJob);
}

/** منع تسريب الذاكرة: حذف المهام المنتهية القديمة */
function pruneJobs() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (!j.child && now - j.createdAt > JOB_TTL) jobs.delete(id);
  }
  if (jobs.size > MAX_JOBS) {
    [...jobs.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, jobs.size - MAX_JOBS)
      .forEach(([id]) => jobs.delete(id));
  }
}

export function formatDuration(sec) {
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
