// Public upload client — رفع برابط دائم + تحويل فيديو محلي إلى GIF
//
// ⚠️ لماذا XHR لا fetch؟ fetch لا يعطي حدثاً لتقدّم الرفع، فيظهر شريط
// التقدّم واقفاً عند 0% حتى ينتهي 200MB. XHR يمرّر onprogress بايت ببايت.
const BASE = import.meta.env.VITE_API_URL || "";

const authToken = () => {
  try { return localStorage.getItem("vv-token") || ""; } catch { return ""; }
};

/** سقوف الرفع كما يطبّقها الخادم (وإن أعادها /api/docs، لكن هذه نسخة محلية
 *  لعرض الحدّ قبل بدء الرفع — الخادم هو المرجع النهائي ويبقى هو من يفرض). */
export const UPLOAD_LIMITS = { guest: 50 * 1048576, user: 200 * 1048576 };

/** الرفع الفعلي — يحلّ بكائن الملف أو يرمي خطأً فيه status ورسالة الخادم */
export function uploadFile(file, { onProgress, lang } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/upload`, true);
    // الاسم في ترويسة (URL-encoded) لا في query ⇒ لا سجلّ قابل للتلاعب
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file"));
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    const t = authToken();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* ردّ غير JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      const err = new Error(body.error || (lang === "en" ? "Upload failed" : "فشل الرفع"));
      err.status = xhr.status;
      err.scan = body.scan || null;
      reject(err);
    };
    xhr.onerror = () => reject(new Error(lang === "en" ? "No connection to the server" : "تعذّر الاتصال بالخادم"));
    xhr.onabort = () => reject(new Error(lang === "en" ? "Upload cancelled" : "أُلغي الرفع"));
    xhr.send(file);
  });
}

const json = async (res, lang) => {
  let body = {};
  try { body = JSON.parse((await res.text()) || "{}"); } catch { /* ردّ غير JSON */ }
  if (!res.ok) {
    const err = new Error(body.error || (lang === "en" ? "Request failed" : "تعذّر إكمال الطلب"));
    err.status = res.status;
    throw err;
  }
  return body;
};

/** تقرير المسح المخزّن (بلا بايتات) — لإعادة فتح الصفحة بلا رفع جديد */
export const uploadMeta = (id, lang) =>
  fetch(`${BASE}/api/upload/${encodeURIComponent(id)}`, {
    headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : {},
  }).then((r) => json(r, lang));

/** 🎞️ فيديو مرفوع ⇒ GIF برابط دائم */
export const gifFromUpload = (id, gif, lang) =>
  fetch(`${BASE}/api/gif-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
    },
    body: JSON.stringify({ id, gif }),
  }).then((r) => json(r, lang));

/** رابط مطلق صالح للنسخ في كود المستخدم (‎<img src>‎ يحتاج كاملاً) */
export const absoluteUrl = (rel) => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return /^https?:\/\//i.test(String(rel || "")) ? String(rel) : `${base}${rel || ""}`;
};

/** ضغط رابط وحفظه على القرص عبر رابط مخفي — العنصر نفسه لا يفعل ذلك في iOS */
function clickToSave(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  if (filename) a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * تنزيل الملف إلى جهاز المستخدم **فعلاً** — لا فتحه في تبويب.
 *
 * لماذا blob وليس زرّاً بخاصية download فقط؟ لأن الاستجابة تأتي
 * بـContent-Disposition: inline ⇒ يفتحها المتصفح في صفحة جديدة بدل حفظها،
 * وبخاصية download وحدها يستوي الحفظ من الموقع فقط (same-origin)، فـblob
 * يضمن الحفظ ويسمح باسم ملف نظيف ويُظهر التقدّم أثناء السحب.
 * وعند أي فشل (شبكة/ذاكرة) نرجع إلى رابط download بسيط ⇒ لا نخسر الهدف.
 *
 * @param {string} url       رابط الملف (نسبي أو مطلق)
 * @param {string} filename  الاسم المرغوب على القرص
 * @param {(p:number)=>void} [onProgress] نسبة 0..1 أثناء السحب
 */
export async function downloadFile(url, filename, onProgress) {
  const href = absoluteUrl(url);
  try {
    const res = await fetch(href, { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || 0;
    let blob;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const parts = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.length;
        if (total && onProgress) onProgress(Math.min(1, loaded / total));
      }
      blob = new Blob(parts, { type: res.headers.get("content-type") || "application/octet-stream" });
    } else {
      blob = await res.blob();
    }
    const objectUrl = URL.createObjectURL(blob);
    clickToSave(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    onProgress?.(1);
    return true;
  } catch {
    clickToSave(href, filename);
    return false;
  }
}
