// Admin API client — يستخدم vv-admin-token
const BASE = import.meta.env.VITE_API_URL || "";
const KEY = "vv-admin-token";
// ⚠️ القراءة المباشرة كانت ترمي في Safari خاص/وضع التصفح الخاص
// ⇒ كل نداءات الأدمن تفشل بـ "تعذّر الاتصال" بدل 401.
const token = () => {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
};
const clearToken = () => {
  try { localStorage.removeItem(KEY); } catch { /* لا شيء */ }
};

function friendly(status, serverMsg) {
  if (status === 401) return "بيانات دخول المدير غير صحيحة";
  if (status === 429) return "محاولات كثيرة جداً — انتظر قليلاً ثم أعد المحاولة";
  if (status === 403) return "لا تملك صلاحية لهذا الإجراء";
  if (status >= 500) return "خطأ في الخادم — حاول لاحقاً";
  return serverMsg || `فشل الطلب (${status})`;
}

/** تحليل JSON بأمان — استجابة فارغة تعيد {} بدل رمي SyntaxError */
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function areq(path, options = {}) {
  const { headers, ...rest } = options;
  let res;
  try {
    res = await fetch(`${BASE}/api/admin${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...headers },
    });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم");
  }
  if (!res.ok) {
    const e = await safeJson(res);
    // ⏱ توكن منتهٍ/ملغى ⇒ لا نتركه في التخزين، وإلا كل محاولة تعيد 401
    if (res.status === 401) clearToken();
    const err = new Error(friendly(res.status, e.error));
    err.status = res.status;
    throw err;
  }
  return safeJson(res);
}

/** توحيد أشكال الردود الآتية كمصفوفة أو { items } أو { data } */
const asArray = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.data) ? v.data : []);
/** توحيد الكائنات وتفادي null */
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const adminLogin = (email, password) =>
  areq("/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const adminLogout = () => clearToken();
export const isAdmin = () => !!token();

export const adminStats = () => areq("/stats").then(asObject);
export const adminJobs = () => areq("/jobs").then(asArray);
// ⚠️ limit يُرسل كما هو ⇒ /recent?limit=999999 يملأ الذاكرة (السيرفر صار يحدّه 1000)
export const adminRecent = (limit = 100) =>
  areq(`/recent?limit=${encodeURIComponent(Math.min(Math.max(Number(limit) || 100, 1), 1000))}`).then(asArray);

export const adminUsers = () => areq("/users").then(asArray);
export const adminCreateUser = (d) => areq("/users", { method: "POST", body: JSON.stringify(d) });
// ⌗ encodeURIComponent: المعرّفات معرّفات نصية وقد تحتوي محارف محجوزة
export const adminDeleteUser = (id) => areq(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
export const adminSetPlan = (id, plan) =>
  areq(`/users/${encodeURIComponent(id)}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
