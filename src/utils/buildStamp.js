/**
 * بصمة الحزمة + تحديث تلقائي للتبويب القديم.
 *
 * السبب: خطأ "Uncaught (in promise) SyntaxError: Unexpected end of JSON input"
 * كان يظهر عند مستخدمين يبقون على تبويب قديم من أصول التطبيق قبل النشر، فيشتغلون
 * كوداً لم يعد له نظير في الخادم. الحل ليس ترقيع موضع الخطأ، بل كشف التبويب
 * القديم: نقرأ اسم ملف الدخول المضمّن في index.html (اسم مُبصَّم يولّده Vite
 * وقت البناء) ونقارنه بما خزّناه في التخزين المحلي، فإن اختلف ⇒ إعادة تحميل.
 */

/** اسم البناء المستخرج من سكربت الدخول داخل index.html. */
export function currentBuildId() {
  try {
    const src =
      document.querySelector('script[type="module"][src*="/assets/"]')?.src || "";
    return src.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] || "dev";
  } catch {
    return "dev";
  }
}

const STORAGE_KEY = "vv-build";

/**
 * @param {{reload?: () => void, pollMs?: number}} [opts] نمرّر reload للاختبار بدل
 *   location.reload، وpollMs لتعديل نبض المقارنة الدورية.
 * @returns {() => void} دالة تنظيف.
 */
export function installStaleTabGuard(opts = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const reload = opts.reload || (() => window.location.reload());

  const current = currentBuildId();

  // 1) عند الإقلاع: إن اختلفت البصمة عن آخر زيارة ⇒ هذه تبويبة قديمة.
  const checkStored = () => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (seen && seen !== current) {
        window.localStorage.setItem(STORAGE_KEY, current);
        reload();
        return true;
      }
      window.localStorage.setItem(STORAGE_KEY, current);
    } catch {
      /* التخزين المحلي محجوب (تصفح خاص) — لا بأس */
    }
    return false;
  };
  if (checkStored()) return () => {};

  // 2) عند العودة إلى التبويب: نسأل الخادم عمّا يقدّمه الآن (بلا كاش).
  const checkServer = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/index.html", { cache: "no-store" });
      const html = await res.text();
      const served = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1];
      if (served && served !== current) reload();
    } catch {
      /* الشبكة قد تكون غير متاحة مؤقتاً — نتجاهل */
    }
  };

  document.addEventListener("visibilitychange", checkServer);
  // النقر على النافذة لا يغيّر visibilityState، لكن حدث focus يصدر عند العودة
  // إلى التبويب: مستخدم ينشر نسخة جديدة ثم ينقر رجوعاً إلى تبويبه المفتوح.
  window.addEventListener("focus", checkServer);

  // تبويب يبقى مركّزاً طوال الوقت لا يمرّ على visibilitychange ولا focus،
  // فنمنحه نبضة دورية (index.html فقط بلا كاش) حتى يتعافى من النشر تلقائياً.
  const pollMs = Number.isFinite(opts.pollMs) ? opts.pollMs : 60_000;
  const timer = pollMs > 0 ? setInterval(checkServer, pollMs) : null;

  return () => {
    document.removeEventListener("visibilitychange", checkServer);
    window.removeEventListener("focus", checkServer);
    if (timer) clearInterval(timer);
  };
}

export default installStaleTabGuard;