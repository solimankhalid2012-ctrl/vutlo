/**
 * التقاط أخطاء المتصفح غير الملتقطة وإرسالها إلى السيرفر.
 *
 * بدون هذا، أي خطأ يظهر في Console فقط على جهاز المستخدم ولا يصلنا،
 * فيضيع وقت طويل في التخمين. هنا نطبع كل خطأ في الطرفية عند التطوير
 * (بلا حلقات لا نهائية) ونرسل نسخة مختصرة إلى /api/client-error.
 */
import { currentBuildId } from "./buildStamp.js";

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
    build: currentBuildId(), // ⇐ يميّز خطأ حزمة قديمة عن خطأ برمجي حقيقي
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
  report("react-render-error", error?.message || String(error), error?.stack, {
    componentStack: String(componentStack || "").slice(0, 400),
  });
}

// ══════════════════════════════════════════════════════════════
// 🔬 تتبّع اختياري: أضف ?trace=1 إلى الرابط لإظهار لوحة تعرض أخطاء
//    المتصفح غير الملتقطة مع الملف والسطر داخل الصفحة نفسها.
//    السبب: خطأ "Uncaught (in promise) SyntaxError" في كونسول DevTools
//    يظهر سطره الأول فقط، فنضطر للتخمين من دون تحديد المصدر.
//    لا شيء يعمل ولا يُرسل ما لم يُطلب صراحةً عبر ?trace=1.
// ══════════════════════════════════════════════════════════════
function installTracer() {
  if (typeof window === "undefined") return;
  if (!/[?&]trace=1\b/.test(window.location.search)) return;

  const items = [];
  let box = null;

  const ensureBox = () => {
    if (box) return box;
    box = document.createElement("div");
    box.style.cssText = [
      "position:fixed", "inset:auto 8px 8px 8px", "z-index:2147483647",
      "max-height:45vh", "overflow:auto", "background:#1b1b1f", "color:#ffd7d7",
      "border:1px solid #7f1d1d", "border-radius:10px", "padding:10px 12px",
      "font:12px/1.5 ui-monospace,Menlo,Consolas,monospace", "direction:ltr",
      "textAlign:left", "box-shadow:0 8px 32px rgba(0,0,0,.5)",
    ].join(";");
    document.body.appendChild(box);
    return box;
  };

  const render = () => {
    const el = ensureBox();
    el.innerHTML = "";
    const head = document.createElement("div");
    head.style.cssText = "color:#9ca3af;margin-bottom:6px";
    head.textContent = `trace: ${items.length} error(s) — remove ?trace=1 to hide`;
    el.appendChild(head);
    items.forEach((it, i) => {
      const d = document.createElement("div");
      d.style.cssText = "border-top:1px solid #3f3f46;padding:6px 0;white-space:pre-wrap;word-break:break-word";
      d.textContent = `#${i + 1} ${it.kind}: ${it.message}\n${it.stack}`;
      el.appendChild(d);
    });
  };

  const push = (kind, message, stack) => {
    items.push({ kind, message: clip(message), stack: clip(stack) });
    if (items.length > 20) items.shift();
    render();
  };

  window.addEventListener("error", (e) => {
    const loc = [e.filename, e.lineno, e.colno].filter(Boolean).join(":");
    push("error", `${e.message}${loc ? ` (${loc})` : ""}`, e.error?.stack || "");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    push("unhandledrejection", r?.message || r?.name || String(r), r?.stack || "");
  });
}

export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // طباعة كاملة للطرفية: سطر واحد في DevTools لا يكفي لتحديد المصدر
  const consoleFull = (tag) => (e) => {
    const r = e?.reason ?? e?.error ?? e;
    // eslint-disable-next-line no-console
    console.error(`[${tag}]`, r?.stack || r);
  };
  window.addEventListener("error", consoleFull("window-error"));
  window.addEventListener("unhandledrejection", consoleFull("unhandledrejection"));

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

  installTracer();
}

export default installErrorReporting;
