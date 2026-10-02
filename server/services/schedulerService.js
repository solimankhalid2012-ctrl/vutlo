// ─────────────────────────────────────────────
// schedulerService — جدولة التحميلات (⏰ Download Scheduler)
// مؤقّتات في الذاكرة + ثبات في قاعدة البيانات (حتى لا تضيع بعد
// إعادة تشغيل السيرفر). تُعاد تسليح المهام المعلّقة تلقائياً عند الإقلاع.
// ─────────────────────────────────────────────
import { queueDownload } from "./ytdlpService.js";
import { db } from "./db.js";

const schedules = new Map();
const MAX_FUTURE = 1000 * 60 * 60 * 24 * 30; // حتى 30 يوماً
const MAX_TIMEOUT = 2 ** 31 - 1; // أقصى delay يقبله setTimeout (~24.8 يوماً)

/** خطأ إدخال مكتوب بيدنا ⇒ آمن للعرض (expose) مع 400 */
const schedError = (message) => {
  const e = new Error(message);
  e.status = 400;
  e.expose = true;
  return e;
};

/** جدولة تحميل لوقت لاحق — تُنفّذ تلقائياً عبر queueDownload */
export function scheduleDownload({ url, runAt, options = {}, userId = null }) {
  if (!url || typeof url !== "string") throw schedError("رابط مفقود");
  if (url.length > 2048) throw schedError("الرابط طويل جداً");
  const at = new Date(runAt).getTime();
  if (!Number.isFinite(at)) throw schedError("وقت غير صالح (ISO datetime)");
  const delay = at - Date.now();
  if (delay <= 0) throw schedError("اختر وقتاً في المستقبل");
  if (delay > MAX_FUTURE) throw schedError("الحد الأقصى 30 يوماً");

  const id = `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const rec = {
    id, url, runAt: new Date(at).toISOString(), options, userId,
    status: "pending", jobId: null, error: null, createdAt: Date.now(),
  };
  schedules.set(id, rec);
  arm(rec);
  db.addSchedule(rec).catch(() => {}); // الحفظ لا يمنع الجدولة
  return publicRec(rec);
}

/**
 * ضبط المؤقّت — يُعاد التسليح على دفعات لأن setTimeout يفيض
 * فوق ~24.8 يوماً فتُنفّذ المهمة فوراً إذا تجاوز الجدولة ذلك الحد.
 */
function arm(rec) {
  const remaining = new Date(rec.runAt).getTime() - Date.now();
  if (rec.status !== "pending") return;
  if (remaining <= 0) return void fire(rec);
  rec.timer = setTimeout(() => (remaining > MAX_TIMEOUT ? arm(rec) : fire(rec)), Math.min(remaining, MAX_TIMEOUT));
  rec.timer.unref?.();
}

async function fire(rec) {
  rec.status = "running";
  db.updateSchedule(rec.id, { status: "running" }).catch(() => {});
  try {
    // ⚠️ كان بلا userId ⇒ المهمة المنفَّذة تصير "ضيف" فيرفض صاحبها متابعتها (403)
    const job = await queueDownload(rec.url, { ...rec.options, userId: rec.userId || null });
    rec.jobId = job.jobId;
    rec.status = "done";
    db.updateSchedule(rec.id, { status: "done", jobId: job.jobId }).catch(() => {});
  } catch (e) {
    rec.status = "error";
    rec.error = String(e.message || e);
    db.updateSchedule(rec.id, { status: "error", error: rec.error }).catch(() => {});
  }
}

/**
 * إلغاء مهمة مجدولة — async لأن سجلها قد يكون في القاعدة فقط.
 * كان يعيد !!rec فقط، فيردّ 404 على مهمة موجودة في القاعدة لكن غير موجودة
 * في الذاكرة (بعد إعادة تشغيل) رغم نجاح الإلغاء فعلياً.
 */
export async function cancelSchedule(id, userId = undefined) {
  const rec = schedules.get(id);
  // ⚠️ كان فحص الملكية يقفز تماماً إن لم تكن المهمة في الذاكرة، أي لكل مهمة
  // محفوظة من جلسة سابقة انتهت أو كانت منتهية أصلاً ⇒ أي زائر يمرّر معرّفاً
  // صادراً فيعلّم جدولة مستخدم آخر "ملغاة" (IDOR + كاشف وجود بالمعرّف).
  // نبحث في القاعدة عند غيابه عن الذاكرة ونطبّق قاعدة الملكية نفسها:
  // المالك، أو الأدمن (userId === undefined)، أو مهمة بلا مالك.
  const known = rec ?? (await db.listSchedules().catch(() => [])).find((r) => r.id === id) ?? null;
  if (!known) return false; // غير موجودة إطلاقاً ⇒ لا نكتب شيئاً (fail-closed)
  if (userId !== undefined && known.userId && known.userId !== userId) return false;
  if (rec) {
    if (rec.timer) clearTimeout(rec.timer);
    rec.timer = null;
    rec.status = "cancelled";
  }
  // نحدّث القاعدة أيضاً: مهمة محفوظة من جلسة سابقة ليست في الذاكرة،
  // والإلغاء ينجح فعلياً فلا يجوز أن يردّ السيرفر 404.
  const saved = await db.updateSchedule(id, { status: "cancelled" }).catch(() => false);
  return !!rec || !!saved;
}

export function listSchedules() {
  return [...schedules.values()].map(publicRec);
}

/**
 * 🔐 جدولات مستخدم واحد — تستعملها /api/schedules.
 * الضيف (userId فارغ) يرى فقط المهام التي بلا مالك.
 * ملاحظة: listSchedules() بلا وسيط تبقى للجميع (للإدارة والاستعادة).
 */
export function listSchedulesFor(userId) {
  return [...schedules.values()]
    .map(publicRec)
    .filter((r) => !r.userId || r.userId === userId);
}

/**
 * 🔄 استعادة المهام المعلّقة بعد إعادة تشغيل السيرفر:
 * نقرأها من القاعدة ونعيد تسليح مؤقّتاتها. ما مضى موعده يُنفَّذ فوراً.
 */
export async function restoreSchedules() {
  const rows = await db.listSchedules().catch(() => []);
  const pending = rows.filter((r) => r.status === "pending");
  if (!pending.length) return 0;
  for (const r of pending) {
    const rec = { ...r, timer: null };
    schedules.set(rec.id, rec);
    arm(rec);
  }
  console.log(`[scheduler] أُعيد تسليح ${pending.length} مهمة مجدولة بعد الإقلاع`);
  return pending.length;
}

function publicRec(r) {
  const { timer, ...pub } = r;
  return pub;
}