// ─────────────────────────────────────────────
// services/retention.js — تنظيف ملفات التحميل منتهية الأجل
//
// الثغرة: سجل المهمة (job) يُحذف بعد ساعة (JOB_TTL) لكن الملف على القرص
// كان يبقى للأبد. أثران:
//   1) نموّ بلا حدّ للقرص — 15 طلب/دقيقة مسموحة، وكل ملف قد يكلّف مئات
//      الميغابايت، فيكفي مهاجم واحد لملء القرص.
//   2) بقاء كل ملف رابطاً عاماً مفتوحاً للأبد عبر /files (express.static
//      بلا مصادقة) ⇒ أي رابط يتسرّب مرة (سجل متصفح، CDN، referer) يمنح
//      وصولاً مجهولاً دائماً إلى ذلك الملف.
// الحل: حذف ما تجاوز عمره FILE_TTL_HOURS على أن يُستثنى ملفٌ قيد الكتابة.
// ─────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { DOWNLOAD_DIR } from "./paths.js";

/** عمر الملف بعد آخر تعديل قبل حذفه. 6 ساعات افتراضياً: وقت كافٍ ليضغط
 *  المستخدم رابط التنزيل أو ينسخ الملف، وسقف معقول للملفات الكبيرة.
 *  قيمة صفرية/سالبة/NaN تُرفض وتعود للافتراضي 6 ساعات: حدٌّ صفري يجعل
 *  كل عملية تنظيف تمسح الملفات فيُفقد المستخدم ما نزّله للتوّ. */
const DEFAULT_TTL_MS = 6 * 3600_000;
function resolveTtlMs() {
  const n = Number(process.env.FILE_TTL_HOURS);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MS;
  return n * 3600_000;
}
export const FILE_TTL_MS = resolveTtlMs();
const SWEEP_EVERY_MS = 15 * 60_000;
let sweeper = null;

/** حذف الملفات المنتهية الأجل. يُرجع { removed, bytes } أو {0,0} إن لم
 *  يوجد المجلد (لا نرمي: التنظيف عملية صيانة لا يجب أن تُسقط الخادم). */
export function sweepOldFiles(now = Date.now()) {
  let removed = 0;
  let bytes = 0;
  let entries;
  try {
    entries = fs.readdirSync(DOWNLOAD_DIR, { withFileTypes: true });
  } catch {
    return { removed: 0, bytes: 0 };
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue; // لا نلمس المجلدات
    const full = path.join(DOWNLOAD_DIR, ent.name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs <= FILE_TTL_MS) continue;
      fs.unlinkSync(full);
      removed += 1;
      bytes += st.size;
    } catch {
      /* ملف يحذفه آخر أو permissions ⇒ نتخطّاه ونكمل */
    }
  }
  return { removed, bytes };
}

/** يشغّل المنظّف دورياً (وعند الإقلاع: يتخلّص من تراكم النسخ السابقة). */
export function startRetention() {
  sweepOldFiles();
  if (sweeper) return;
  sweeper = setInterval(() => {
    const { removed, bytes } = sweepOldFiles();
    if (removed) {
      console.log(`[retention] حُذف ${removed} ملفاً منتهياً (${(bytes / 1048576).toFixed(1)}MB)`);
    }
  }, SWEEP_EVERY_MS);
  sweeper.unref?.(); // لا يمنع إغلاق العملية
}