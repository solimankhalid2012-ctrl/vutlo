// Public Auth client — يخزّن vv-token وبيانات المستخدم في localStorage
const BASE = import.meta.env.VITE_API_URL || "";
const token = () => {
  try { return localStorage.getItem("vv-token") || ""; } catch { return ""; }
};

/** يحوّل أخطاء HTTP إلى رسائل عربية ودّية */
function friendly(status, serverMsg, lang) {
  const ar = lang !== "en";
  if (status === 401) return ar ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : "Incorrect email or password";
  if (status === 409) return ar ? "هذا البريد مسجّل مسبقاً — جرّب تسجيل الدخول" : "This email is already registered — try logging in";
  if (status === 429) return ar ? "محاولات كثيرة جداً — انتظر قليلاً ثم أعد المحاولة" : "Too many attempts — please wait a moment and retry";
  if (status === 400) return serverMsg || (ar ? "بيانات غير صالحة" : "Invalid input");
  if (status >= 500) return ar ? "خطأ في الخادم — حاول لاحقاً" : "Server error — please try again later";
  return serverMsg || (ar ? "تعذّر إكمال الطلب" : "Request failed");
}

/** تحليل JSON بأمان — استجابة فارغة تعيد {} بدل رمي SyntaxError */
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function ureq(path, options = {}, lang) {
  const { headers, ...rest } = options;
  let res;
  try {
    res = await fetch(`${BASE}/api/auth${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...headers },
    });
  } catch {
    throw new Error(lang === "en" ? "No connection to the server" : "تعذّر الاتصال بالخادم");
  }
  if (!res.ok) {
    const e = await safeJson(res);
    const err = new Error(friendly(res.status, e.error, lang));
    err.status = res.status;
    // 401 = التوكن منتهٍ/غير صالح — نظّفه فوراً حتى لا تتكرر المحاولات
    if (res.status === 401) {
      try { localStorage.removeItem("vv-token"); localStorage.removeItem("vv-user"); } catch {}
    }
    throw err;
  }
  return safeJson(res);
}

export const register = (email, password, lang) => ureq("/register", { method: "POST", body: JSON.stringify({ email, password }) }, lang);
export const loginUser = (email, password, lang) => ureq("/login", { method: "POST", body: JSON.stringify({ email, password }) }, lang);
export const me = () => ureq("/me");
export const saveSession = (userToken, user) => {
  try {
    localStorage.setItem("vv-token", userToken);
    localStorage.setItem("vv-user", JSON.stringify(user));
  } catch {}
  window.dispatchEvent(new Event("vv-auth"));
};
export const logoutUser = () => {
  try { localStorage.removeItem("vv-token"); localStorage.removeItem("vv-user"); } catch {}
  window.dispatchEvent(new Event("vv-auth"));
};
export const currentUser = () => {
  try { return JSON.parse(localStorage.getItem("vv-user") || "null"); } catch { return null; }
};
export const isLoggedIn = () => !!token();
