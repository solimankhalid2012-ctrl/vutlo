// ─────────────────────────────────────────────
// config/trustProxy.js — كم عدد الـproxies الموثوقة؟
//
// الثغرة: `app.set("trust proxy", 1)` كان مضبوطاً دائماً.
// مع nginx الافتراضي (proxy_add_x_forwarded_for) يُضيف الـproxy عنوان العميل
// إلى قيمة X-Forwarded-For التي يرسلها العميل، فيقرأ Express أقرب مدخل
// (أي ما اختاره المهاجم) ويحسبه req.ip ⇒ كل طلب بترويسة جديدة يحصل على
// سجلّ حدٍّ نظيف، أي أن كل حدود الطلبات تصبح بلا قيمة.
//
// الحل: الافتراضي false (fail-closed، وهو الصحيح للنشر المباشر على VPS)،
// ولا يُرفع إلا صراحةً بعد التأكد أن الـproxy يكتب الترويسة ولا يمرّرها.
// ─────────────────────────────────────────────
export function resolveTrustProxy(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "true" || v === "1") return 1;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === "loopback") return "loopback";
  return false;
}