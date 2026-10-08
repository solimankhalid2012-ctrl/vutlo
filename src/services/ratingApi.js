// خدمة التقييم بالنجوم — العميل
//
// قاعدة واحدة: التصويت مربوط بمعرّف متصفح (localStorage) لا بحساب، فالزائر
// يستطيع التقييم، ويُعدَّ العدّاد على الخادم (upsert) فلا يتضاعف عند تغيير
// الرأي. ولا نرسل أي معرّف شخصي — ولا IP — لأن العدد لا يحتاج معرفة من قام به.
//
// الإحصاءات مشتركة بين كل من يعرضها (الواجهة الرئيسية + رابط التحميل)
// عبر متجر مصغّر: استعلام واحد، وتصويت واحد يُحدِّث الجميع فوراً.

const BASE = import.meta.env.VITE_API_URL || "";
const KEY_CLIENT = "vv-rater"; // معرّف هذا المتصفح ⇒ صوت واحد
const KEY_MINE = "vv-rating";  // تقييمي (نفس مفتاح RatingStars)

/** معرّف قوي بلا تبعيات */
const mint = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 6)}`;

let ephemeral = null; // لوضع الخصوصية حيث يُمنع localStorage

/**
 * معرّف المتصفح: نخزّنه مرة واحدة. لو مُنع التخزين (وضع خصوصية) نولّد
 * معرّفاً لكل صفحة بدل معرّف واحد مشترك — وإلا صار تصويت الجميع يكتب في
 * نفس السطر ويتناقض بينهم.
 */
function clientId() {
  try {
    const stored = localStorage.getItem(KEY_CLIENT);
    if (stored) return stored;
    const id = mint();
    localStorage.setItem(KEY_CLIENT, id);
    return id;
  } catch {
    ephemeral = ephemeral || mint();
    return ephemeral;
  }
}

/** تقييمي الحالي (0 = لم أقيّم بعد) */
export function myRating() {
  try {
    const n = Number(localStorage.getItem(KEY_MINE) || 0);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
  } catch { return 0; }
}

// ── المتجر المصغّر ──
/** stats: آخر إحصاءات مقبولة | error: رسالة فشل التصويت | busy: جارٍ الحفظ */
let store = { stats: null, error: "", busy: false };
const listeners = new Set();

const publish = (patch) => {
  store = { ...store, ...patch };
  listeners.forEach((fn) => fn(store));
};

/** اشترك بتغييرات التقييم — يعيد فك الاشتراك */
export const subscribeRating = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const ratingSnapshot = () => store;

const parse = async (res, lang) => {
  let body = {};
  try { body = JSON.parse((await res.text()) || "{}"); } catch { /* ليس JSON */ }
  if (!res.ok) {
    const err = new Error(body.error || (lang === "en" ? "Rating failed" : "تعذّر حفظ التقييم"));
    err.status = res.status;
    throw err;
  }
  return body;
};

/** جلب الإحصاءات مرة واحدة فقط ثم لا يُعاد طلبه (التصويت يحدّثها) */
export async function fetchRating(lang) {
  if (store.stats) return store.stats;
  try {
    const stats = await parse(await fetch(`${BASE}/api/rating`), lang);
    publish({ stats });
    return stats;
  } catch {
    // فشل القراءة ليس خطأ يوقف الصفحة — تبقى النجوم صالحة للتصويت
    return store.stats;
  }
}

/** تصويت/تغيير رأي ⇒ الإحصاءات الجديدة بعد الحفظ */
export async function postRating(stars, lang) {
  publish({ busy: true, error: "" });
  try {
    let res;
    try {
      res = await fetch(`${BASE}/api/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: Number(stars), clientId: clientId() }),
      });
    } catch {
      // انقطاع الشبكة ليس خطأ ردّ — نصّ موحّد كما في services/api.js
      const e = new Error(
        lang === "en"
          ? "Could not reach the server — is it running?"
          : "تعذّر الاتصال بالخادم — تأكد أن الخادم يعمل",
      );
      e.status = 0;
      throw e;
    }
    const stats = await parse(res, lang);
    publish({ stats, busy: false });
    return stats;
  } catch (e) {
    publish({ busy: false, error: e?.message || "" });
    throw e;
  }
}
