// ─────────────────────────────────────────────
// config/passwords.js — تجزئة كلمات السر والتحقق منها
// scrypt (من مكتبة Node) بملح عشوائي لكل مستخدم + مقارنة constant-time.
// يدعم ترقية تلقائية من SHA-256 القديم (المخطط كان says "الإنتاج: bcrypt").
// ─────────────────────────────────────────────
import crypto from "crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const PREFIX = "scrypt";

/** هاش SHA-256 القديم (للترحيل فقط) */
const legacyHash = (pw = "") => crypto.createHash("sha256").update(`vv:${pw}`).digest("hex");

/** طول بصيغة: scrypt$N$r$p$salt$key (كلها base64url) */
export function hashPassword(password = "") {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024,
  });
  return [
    PREFIX, SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/** مقارنة بزمن ثابت — تمنع استنتاج الهاش من توقيت التنفيذ */
export function safeEqual(a = "", b = "") {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // نُقارنDummy بطول ثابت حتى لا يكشف الاختلاف من التوقيت
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function isScrypt(hash = "") {
  return String(hash).startsWith(`${PREFIX}$`);
}

/**
 * التحقق من كلمة السر. يعيد { ok, needsUpgrade }.
 * - إن كان الهاش scrypt: مقارنة constant-time.
 * - إن كان SHA-256 القديم: مقارنة عادية (لترحيل فوري) + needsUpgrade.
 */
export function verifyPassword(password = "", stored = "") {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (isScrypt(stored)) {
    const parts = String(stored).split("$");
    if (parts.length !== 6) return { ok: false, needsUpgrade: false };
    const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
    const N = Number(nStr), r = Number(rStr), p = Number(pStr);
    // 🛡️ لا نثق بمعاملات مخزّنة: N ضخم = DoS عبر استهلاك ذاكرة/CPU.
    if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return { ok: false, needsUpgrade: false };
    if (!Number.isInteger(r) || r < 1 || r > 32) return { ok: false, needsUpgrade: false };
    if (!Number.isInteger(p) || p < 1 || p > 16) return { ok: false, needsUpgrade: false };
    try {
      const salt = Buffer.from(saltB64, "base64url");
      const expected = Buffer.from(keyB64, "base64url");
      if (expected.length < 16 || expected.length > 128) return { ok: false, needsUpgrade: false };
      const actual = crypto.scryptSync(String(password), salt, expected.length, {
        N, r, p, maxmem: 64 * 1024 * 1024,
      });
      return { ok: safeEqual(expected.toString("base64url"), actual.toString("base64url")), needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  // ترقية من SHA-256 القديم — needsUpgrade فقط عند نجاح المطابقة
  const ok = safeEqual(legacyHash(password), stored);
  return { ok, needsUpgrade: ok };
}

/** ثابت نصي: واجهة قديمة (SHA-256) — للتوافق الخلفي إن استُخدمت مباشرة */
export const hashPasswordLegacy = legacyHash;

/**
 * سياسة كلمة السر. نطلب 8 أحرف كحد أدنى بدون شروط تعقيد مرهقة،
 * لكن نرفضLeaks شائعة و passwords قصيرة جداً.
 */
export function validatePassword(pw = "") {
  if (typeof pw !== "string") return { ok: false, error: "كلمة السر غير صالحة" };
  const p = pw;
  if (p.length < 8) return { ok: false, error: "كلمة السر 8 أحرف على الأقل" };
  if (p.length > 200) return { ok: false, error: "كلمة السر طويلة جداً" };
  const low = p.toLowerCase();
  const weakList = [
    "password", "password1", "passw0rd", "12345678", "123456789", "1234567890",
    "qwertyui", "qwerty123", "admin123", "administrator", "letmein1", "iloveyou",
    "welcome1", "monkey12", "football", "baseball",
  ];
  if (weakList.includes(low)) {
    return { ok: false, error: "كلمة السر شائعة جداً — اختر كلمة أقوى" };
  }
  if (/^(.)\1+$/.test(p)) {
    return { ok: false, error: "كلمة السر ضعيفة — لا تكرّر الحرف نفسه" };
  }
  // تواريخ/أرقام متسلسلة شائعة
  if (/^(19|20)\d{2}$/.test(p) || /^\d{6,}$/.test(p)) {
    return { ok: false, error: "كلمة السر ضعيفة — لا أرقام فقط" };
  }
  return { ok: true };
}

/** تحقق بريد مُشدد (يكافئ testnet المحلي بلا كلفة) */
export function validateEmail(email = "") {
  const e = String(email).trim().toLowerCase();
  if (e.length > 254) return { ok: false, error: "البريد طويل جداً" };
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return { ok: false, error: "بريد غير صالح" };
  return { ok: true, email: e };
}
