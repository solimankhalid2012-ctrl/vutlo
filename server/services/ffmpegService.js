// ─────────────────────────────────────────────
// ffmpegService — تحويل الصيغ / ضغط / GIF عبر FFmpeg مباشرة
// يتطلب: ffmpeg في PATH (أو FFMPEG_PATH في .env)
//
// الأمان/الاستقرار:
// • حدّ تزامن (MAX_FFMPEG) + طابور محدود ⇒ لا يمكن استنزاف المعالج بطلبات متوازية
// • -nostdin ⇒ ffmpeg لا يلتقط stdin أبداً (يمنع تعليق العمليات)
// • تقييد كل معامل من المستخدم (start/duration/width/crf) قبل بناء الأمر
// • لا تُعاد مسارات داخلية للعميل (basename فقط) ولا رسائل ffmpeg الخام
// ─────────────────────────────────────────────
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { DOWNLOAD_DIR as DOWNLOADS_DIR } from "./paths.js";

const exec = promisify(execFile);
/** مسار ffmpeg الفعّال — يُصدَّر ليستخدمه yt-dlp عبر --ffmpeg-location */
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const DOWNLOAD_DIR = DOWNLOADS_DIR;

const CONVERTIBLE = new Set(["mp4", "mkv", "webm", "avi", "mp3"]);

/** حدّ العمليات المتزامنة وطابور الانتظار (حماية من DoS) */
export const MAX_FFMPEG = Math.max(1, Number(process.env.MAX_FFMPEG) || 2);
const MAX_WAITING = Math.max(0, Number(process.env.FFMPEG_MAX_WAITING) || 6);

let active = 0;
const waiting = [];

/** خطأ آمن للعرض على المستخدم (expose) أو خطأ داخلي */
const userError = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
};

function acquire() {
  if (active < MAX_FFMPEG) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (waiting.length >= MAX_WAITING) {
      reject(userError("طابور معالجة الفيديو مزدحم — أعد المحاولة بعد قليل", 503));
      return;
    }
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release() {
  active -= 1;
  const next = waiting.shift();
  if (next) next();
}

/** عدد العمليات الجارية + المنتظرة (لـ /api/health) */
export function ffmpegDepth() {
  return { active, waiting: waiting.length, max: MAX_FFMPEG };
}

/** يشغّل ffmpeg مع Flags أمان موحّدة (stdin/loglevel/buffer/timeout) */
async function run(args, timeoutMs, what) {
  try {
    return await exec(
      FFMPEG,
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
    );
  } catch (e) {
    // stderr الخاص بـffmpeg قد يحتوي مسارات داخلية — نطبعه في السجل فقط
    console.error(`[ffmpeg:${what}]`, String(e?.stderr || e?.message || e).slice(0, 800));
    const m = String(e?.message || "");
    if (/killed|ETIMEDOUT|timeout/i.test(m))
      throw userError("انتهت مهلة معالجة الفيديو — جرّب ملفاً أقصر", 504);
    if (/No such file|Invalid data|does not contain any stream|Unknown encoder|Invalid argument|not a directory/i.test(m))
      throw userError("تعذّرت معالجة الملف — قد يكون تالفاً أو بصيغة غير مدعومة");
    throw userError("فشلت معالجة الفيديو على الخادم", 500);
  }
}

async function withSlot(fn) {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

function resolveInput(jobIdOrPath) {
  // يقبل jobId أو مسار ملف داخل مجلد التحميل فقط (حماية من Path Traversal)
  const base = path.basename(String(jobIdOrPath || ""));
  if (!base) throw userError("معرّف الملف مفقود");
  const direct = path.join(DOWNLOAD_DIR, base);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  const hit = fs.readdirSync(DOWNLOAD_DIR).find((f) => f.startsWith(base + "."));
  if (hit) return path.join(DOWNLOAD_DIR, hit);
  throw userError("الملف غير موجود — حمّل الفيديو أولاً", 404);
}

/** يتأكد أن ffmpeg أنتج ملفاً فعلياً (وإلا فلا نُبلّغ العميل بنجاح كاذب) */
function assertOutput(out) {
  let size = 0;
  try {
    size = fs.statSync(out).size;
  } catch {
    throw userError("لم يُنتج المحرك ملفاً صالحاً", 500);
  }
  if (!size) {
    try { fs.unlinkSync(out); } catch { /* تجاهُل */ }
    throw userError("الناتج فارغ — قد يكون المصدر تالفاً", 500);
  }
  return size;
}

/** 🔄 تحويل الصيغة: MP4 ↔ MKV ↔ WEBM ↔ AVI + استخراج MP3 */
export async function convertTo(jobIdOrPath, target) {
  if (!CONVERTIBLE.has(target)) throw userError("صيغة الهدف غير مدعومة");
  return withSlot(async () => {
    const input = resolveInput(jobIdOrPath);
    const out = input.replace(/\.[^.]+$/, "") + `_converted.${target}`;
    const args =
      target === "mp3"
        ? ["-i", input, "-vn", "-b:a", "320k", out]
        : ["-i", input, "-c", "copy", out]; // نسخ سريع بدون إعادة ترميز
    try {
      await run(args, 1000 * 60 * 30, "convert");
    } catch {
      // fallback: إعادة ترميز كاملة إن فشل النسخ (صيغ غير متوافقة)
      await run(["-i", input, out], 1000 * 60 * 30, "convert-fallback");
    }
    const size = assertOutput(out);
    return { file: path.basename(out), fileUrl: `/files/${path.basename(out)}`, size };
  });
}

/** 🗜️ ضغط الفيديو (CRF أعلى = حجم أصغر؛ الافتراضي 28 متوازن) */
export async function compressVideo(jobIdOrPath, crf = 28) {
  const c = Math.min(Math.max(Number(crf) || 28, 18), 40);
  return withSlot(async () => {
    const input = resolveInput(jobIdOrPath);
    const out = input.replace(/\.[^.]+$/, "") + `_compressed.mp4`;
    await run(
      ["-i", input, "-vcodec", "libx264", "-crf", String(c), "-preset", "veryfast", "-acodec", "aac", out],
      1000 * 60 * 60,
      "compress"
    );
    const size = assertOutput(out);
    const before = fs.statSync(input).size;
    return {
      file: path.basename(out),
      fileUrl: `/files/${path.basename(out)}`,
      before,
      after: size,
      // النتيجة قد تكون أكبر (CRF 18 على مقطع مرتفع) ⇒ لا نعرض "توفير" سالباً
      savedPct: before > 0 ? Math.max(0, Math.round((1 - size / before) * 100)) : 0,
    };
  });
}

/** تقييد معاملات GIF في مكان واحد (قابل للاختبار) */
export function clampGifArgs({ start = 0, duration = 3, width = 480 } = {}) {
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
  return {
    start: Math.min(Math.max(Math.round(num(start, 0)), 0), 6 * 3600),
    duration: Math.min(Math.max(Math.round(num(duration, 3)), 1), 20),
    width: Math.min(Math.max(Math.round(num(width, 480)), 120), 720),
  };
}

/** 🎞️ تحويل مقطع إلى GIF متحرك (لوحة ألوان مزدوجة لجودة عالية) */
export async function videoToGif(jobIdOrPath, opts = {}) {
  const { start, duration, width } = clampGifArgs(opts);
  return withSlot(async () => {
    const input = resolveInput(jobIdOrPath);
    const base = input.replace(/\.[^.]+$/, "");
    const palette = `${base}_palette.png`;
    const out = `${base}.gif`;
    const vf = `fps=12,scale=${width}:-1:flags=lanczos`;
    try {
      await run(["-ss", String(start), "-t", String(duration), "-i", input, "-vf", `${vf},palettegen`, palette], 1000 * 60 * 10, "gif-palette");
      await run(
        ["-ss", String(start), "-t", String(duration), "-i", input, "-i", palette, "-lavfi", `${vf} [x]; [x][1:v] paletteuse`, out],
        1000 * 60 * 10,
        "gif"
      );
    } finally {
      try { fs.unlinkSync(palette); } catch { /* تجاهُل */ }
    }
    const size = assertOutput(out);
    return { file: path.basename(out), fileUrl: `/files/${path.basename(out)}`, size, start, duration, width };
  });
}
