// ── طبقة الاتصال بالباكند ──
import { getAdvOptions } from "../hooks/useAdvOptions.js";

const BASE = import.meta.env.VITE_API_URL || "";

// توكن المستخدم (النقاط) يُرفق تلقائياً إن وُجد — دون كسر وضع الضيف
function userHeader() {
  try {
    const t = localStorage.getItem("vv-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

/**
 * تحليل JSON بأمان: استجابة فارغة أو غير JSON تعيد {} بدل رمي
 * "Unexpected end of JSON input" (وهي تظهر كـ Uncaught (in promise)).
 */
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function req(path, options = {}) {
  const { headers, ...rest } = options;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      // ندمج headers بعد options حتى لا يسقط options.headers الترويسة
      // المحسوبة (Authorization) — كان {...options} بعدها يُلغيها بالكامل.
      headers: { "Content-Type": "application/json", ...userHeader(), ...headers },
    });
  } catch {
    const e = new Error("تعذّر الاتصال بالخادم — تأكد أن الخادم يعمل");
    e.status = 0;
    throw e;
  }
  if (!res.ok) {
    const err = await safeJson(res);
    const e = new Error(err.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return safeJson(res);
}

/** حماية من ردود غير متوقعة: القوائم يجب أن تبقى مصفوفات حتى لا تنهار الصفحة */
const asArray = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** POST /api/info — معاينة الفيديو (عنوان + thumbnail + مدة + جودات) */
export const fetchVideoInfo = (url) => req("/api/info", { method: "POST", body: JSON.stringify({ url }) }).then(asObject);

/** POST /api/download — بدء التحميل (يُرجع fileUrl / jobId)
 * مصدر واحد للحقيقة: المتجر المشترك (vv-adv) ثم حقول extra الصريحة من النموذج.
 * الحقول undefined تُستبعد حتى لا تمسح قيمة محفوظة. */
export const startDownload = (url, { quality, format, extra } = {}) => {
  const stored = getAdvOptions();
  const explicit = Object.fromEntries(
    Object.entries(extra || {}).filter(([, v]) => v !== undefined),
  );
  return req("/api/download", {
    method: "POST",
    body: JSON.stringify({ url, quality, format, ...stored, ...explicit }),
  });
};

export const getHistory = () => req("/api/history").then(asArray);

/** ✉️ نموذج التواصل */
export const postContact = (data) => req("/api/contact", { method: "POST", body: JSON.stringify(data) });

/** 📃 POST /api/playlist — عناصر قائمة تشغيل/قناة */
export const fetchPlaylist = (url) =>
  req("/api/playlist", { method: "POST", body: JSON.stringify({ url }) }).then((d) => ({
    ...asObject(d),
    entries: asArray(d?.entries),
  }));

/** 📊 GET /api/job/:id — حالة مهمة + تقدم حي */
export const getJob = (id) => req(`/api/job/${id}`).then(asObject);

/** ❌ DELETE /api/job/:id — إلغاء مهمة جارية */
export const cancelJob = (id) => req(`/api/job/${id}`, { method: "DELETE" });

/** ⏰ الجدولة */
export const scheduleDownload = (payload) => req("/api/schedule", { method: "POST", body: JSON.stringify(payload) });
export const getSchedules = () => req("/api/schedules").then(asArray);
export const cancelSchedule = (id) => req(`/api/schedule/${id}`, { method: "DELETE" });

/** 🔄 FFmpeg: تحويل / ضغط / GIF */
export const convertJob = (jobId, target) => req("/api/convert", { method: "POST", body: JSON.stringify({ jobId, target }) });
export const compressJob = (jobId, crf = 28) => req("/api/compress", { method: "POST", body: JSON.stringify({ jobId, crf }) });
export const gifJob = (jobId, opts = {}) => req("/api/gif", { method: "POST", body: JSON.stringify({ jobId, ...opts }) });

/** 🧑‍💻 توثيق API العام */
export const getApiDocs = () => req("/api/docs").then(asObject);

/**
 * روابط الملفات القادمة من الباكند (/files/xxx.mp4) نسبية.
 * في التطوير (نفس الأصل) هي صحيحة، لكن عند فصل الواجهة عن الباكند
 * (VITE_API_URL يشير إلى api.example.com) تفشل روابط التنزيل.
 * نحوّلها المطلقة هنا مرة واحدة بدل تكرار المنطق في كل مكوّن.
 */
export const fileUrl = (p) => {
  const path = String(p || "");
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("data:")) return path;
  if (!path.startsWith("/")) return path;
  return `${BASE}${path}`;
};
