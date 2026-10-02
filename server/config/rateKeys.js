// ─────────────────────────────────────────────
// config/rateKeys.js — مفاتيح عدّاد محاولات الدخول
// المشكلة: الحدّ القديم كان على الـIP وحده، فـ5 محاولات فاشلة كانت تُقفل
// كل الحسابات التي خلف نفس الـNAT/شبكة الجوال (CGNAT) لمدة 15 دقيقة —
// denial of service ضد مستخدمين أبرياء. الآن:
//   1) مفتاح (IP + البريد): يحمي حساباً بعينه دون الإضرار بجيرانه.
//   2) مفتاح الـIP وحده بسقف أعلى: يمنع تخمين عناوين بريد مختلفة من IP واحد.
// ─────────────────────────────────────────────

/** يوسّع عنوان IPv6 إلى 8 مجموعات 16-بت بصيغة موحّدة (أو null إن كان غير صالح).
 *  ⚠️ لا نكتفِ بالdeal النصي: العنوان الواحد له عدة صيغ ("::1" و"0:0:...:1")
 *  والقصّ بالسلسلة يعطي مفاتيح مختلفة ⇒ يُاهَل الحدّ بتغيير الصيغة فقط. */
function expandIPv6(raw) {
  let addr = String(raw).toLowerCase().split("%")[0]; // اقتطاع zone id مثل %eth0
  if (!addr.includes(":")) return null;

  // ::ffff:127.0.0.1 ⇒ ::ffff:7f00:1  (الجزء الأخير قد يكون IPv4 مدموج)
  const lastColon = addr.lastIndexOf(":");
  if (addr.includes(".")) {
    const v4 = addr.slice(lastColon + 1).split(".");
    if (v4.length !== 4) return null;
    const n = v4.map(Number);
    if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    addr = `${addr.slice(0, lastColon + 1)}${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null; // "::" مرتين ⇒ غير صالح
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  if (halves.length === 1 && missing !== 0) return null; // بلا "::" يجب أن تكون 8 بالضبط

  const groups = [...head, ...(halves.length === 2 ? Array(missing).fill("0") : []), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

const isIPv4 = (ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);

/**
 * يوحّد شكل الـIP لمفتاح العدّاد.
 * IPv6: يقصّ إلى /64 ويكتبه بصيغة موسّعة — المزوّد يسلّم عادةً /64 للعميل
 * الواحد، أي أن عنوان واحد يمثّل آلاف الأجهزة ⇒ تكدّس الجميع في عدّاد واحد.
 * ولا يجوز قصّه أكثر (أدقّ من /64) لأن ذلك يميّز أجهزة الجار على نفس الشبكة.
 * IPv4: يُترك كما هو.
 */
export function ipKey(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || "");
  if (!ip) return "unknown-ip";

  if (isIPv4(ip)) return ip;

  const g = expandIPv6(ip);
  if (!g) return `raw:${ip}`; // غير محلول: نُبقيه مميّزاً بدل دمج الجميع

  // ::ffff:a.b.c.d ⇒ نفس الـIPv4، وإلا فسياخذ عنوان واحد مفتاحين
  const mapped = g.slice(0, 5).every((x) => x === "0000") && g[5] === "ffff";
  if (mapped) {
    const to4 = (h) => parseInt(h, 16);
    return `${to4(g[6]) >> 8}.${to4(g[6]) & 255}.${to4(g[7]) >> 8}.${to4(g[7]) & 255}`;
  }
  // يقصّ إلى /64: ثبّت أول 4 مجموعات وأصفّر الباقي ⇒ صيغة موسّعة ثابتة
  return `${g.slice(0, 4).join(":")}::/64`;
}

/** بريد موحّد (lowercase + trim) حتى لا يُتهرَب من الحدّ بتغيير حالة الأحرف.
 *  مقصوص لأن المفتاح يُخزَّن في الذاكرة ولا داعي لحفظ بريد عملاق. */
export function emailKey(req) {
  return String(req?.body?.email ?? "").trim().toLowerCase().slice(0, 120);
}

/** مفتاح محاولات الدخول لكل حساب: IP + البريد. */
export function loginKey(req) {
  return `${ipKey(req)}|${emailKey(req)}`;
}