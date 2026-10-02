/**
 * التقاط أخطاء المتصفح غير الملتقطة وإرسالها إلى السيرفر.
 *
 * بدون هذا، أي خطأ يظهر في Console فقط على جهاز المستخدم ولا يصلنا،
 * فيضيع وقت طويل في التخمين. هنا نطبع كل خطأ في الطرفية عند التطوير
 * (بلا حلقات لا نهائية) ونرسل نسخة مختصرة إلى /api/client-error.
 */
let installed = false;

const MAX_CHARS = 800;
const clip = (v) => String(v ?? "").slice(0, MAX_CHARS);

// أصل الـAPI: في التطوير فارغ (نفس الأصل، والـproxy في vite يوجّه /api)؛
// في الإنتاج هو VITE_API_URL المنشور.
// المسار '/' كان يكسر الإبلاغ كلياً عند فصل الواجهة عن الباكند.
const API_ORIGIN = String(import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
const CLIENT_ERROR_URL = `${API_ORIGIN}/api/client-error`;

/** stringify آمن للبيانات الدائرية (window.onerror قد يمرّر كائناً فيه DOM). */
function safeStringify(value, max = MAX_CHARS) {
  const seen = new WeakSet();
  try {
    const out = JSON.stringify(value, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      if (typeof v === "string") return clip(v);
      if (typeof v === "bigint") return String(v);
      if (typeof v === "function") return "[Function]";
      return v;
    });
    return String(out ?? "").slice(0, max);
  } catch {
    return "[unserializable]";
  }
}

// 🔁 خطأ واحد قد يُطلق عشرات معالجات rejection ⇒ نرسل نسخة واحدة كل 10 ثوانٍ.
const seen = new Map();
function isDuplicate(signature) {
  const now = Date.now();
  const last = seen.get(signature) || 0;
  if (now - last < 10_000) return true;
  if (seen.size > 50) seen.clear();
  seen.set(signature, now);
  return false;
}

function report(kind, message, stack, extra) {
  // نتجنّب التصعيد: لا نرسل أخطاء Reporting API نفسها.
  if (kind === "client-error-report-failed") return;

  const text = String(message ?? "");
  if (isDuplicate(`${kind}|${text}|${String(stack || "").slice(0, 120)}`)) return;

  const payload = {
    kind,
    message: clip(text),
    stack: clip(stack || ""),
    url: clip(typeof location !== "undefined" ? location.href : ""),
    ua: clip(typeof navigator !== "undefined" ? navigator.userAgent : ""),
    time: new Date().toISOString(),
  };
  if (extra) payload.data = safeStringify(extra);

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[captured:${kind}] ${message}`, stack || "");
  }

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CLIENT_ERROR_URL, new Blob([body], { type: "application/json" }));
    } else {
      fetch(CLIENT_ERROR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })?.catch?.(() => {});
    }
  } catch {
    /* تجاهُل — لا نريد أن يسبّب المُبلّغ خطأً جديداً */
  }
}

/** يُستدعى من ErrorBoundary لإبلاغ أخطاء الرندر غير الملتقطة. */
export function reportRenderError(error, componentStack = "") {
  report("react-render-error", error?.message || String(error), error?.stack || componentStack, {
    componentStack: String(componentStack || "").slice(0, 400),
  });
}

export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    report("window-error", e.message, e.error?.stack, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report("unhandledrejection", r?.message || r?.name || String(r), r?.stack);
  });
}

export default installErrorReporting;
