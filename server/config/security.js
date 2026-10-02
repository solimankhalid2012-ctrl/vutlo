// ─────────────────────────────────────────────
// config/security.js — مصدر واحد لكل التحقق من الأسرار
// أي module يستورد JWT_SECRET يقرأه من هنا، فلا تتفرّق القيم ولا تُنسى.
// ─────────────────────────────────────────────
import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";

/** قيم معروفة/ضعيفة يجب ألا تُستخدم أبداً — بما فيها الافتراضيات */
const FORBIDDEN = new Set([
  "change-me-super-secret",
  "changeme",
  "secret",
  "videovault-verify",
  "admin123",
  "password",
  "test",
  "dev",
]);

const MIN_SECRET_LEN = 32;

/** بادئات معروفة ⇒ أي سر يبدأ بها ضعيف حتى لو طوّره أحدهم */
const FORBIDDEN_PREFIX = ["change-me", "changeme", "your-", "my-secret", "default", "example", "test-", "todo"];

function isWeak(secret) {
  if (!secret || typeof secret !== "string") return true;
  const s = secret.trim();
  if (s.length < MIN_SECRET_LEN) return true;
  const low = s.toLowerCase();
  if (FORBIDDEN.has(low)) return true;
  if (FORBIDDEN_PREFIX.some((p) => low.startsWith(p))) return true;
  // متكرر جداً أو تسلسلي بسيط
  if (/^(.)\1+$/.test(s)) return true;
  if (/^(0123456789|abcdefghij|qwerty|password|secret|admin)/i.test(s)) return true;
  return false;
}

/** 256-bit عشوائي بصيغة hex — يُستخدم للتوليد التلقائي */
export function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * يقرأ سراً من البيئة، ويرفض القيم الضعيفة.
 * - الإنتاج: يرمي خطأ (لا يُشغَّل السيرفر أبداً بسر معروف).
 * - التطوير: يولّد سراً عشوائياً في الذاكرة ويطبع تحذيراً واضحاً.
 */
function resolveSecret(name, { required = true, autoGenerate = true } = {}) {
  const raw = process.env[name];
  if (isWeak(raw)) {
    if (isProd) {
      throw new Error(
        `[security] ${name} مفقود أو ضعيف (يلزم ${MIN_SECRET_LEN}+ حرفاً عشوائياً).\n` +
        `          ولّد مفتاحاً:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    if (required && autoGenerate) {
      const generated = generateSecret();
      console.warn(
        `[security] ⚠️  ${name} غير مضبوط/ضعيف — وُلّد مفتاح عشوائي لهذه الجلسة فقط.\n` +
        `          أي توكنات ستبطل عند إعادة التشغيل. ضعه في .env للإنتاج.`
      );
      return generated;
    }
    return "";
  }
  return raw.trim();
}

/** السر الوحيد لكل التوكنات (مستخدم ومدير) */
export const JWT_SECRET = resolveSecret("JWT_SECRET");
export const JWT_ALG = "HS256";

/** سر موقع الأدمن — مُجزّأ في .env عبر ADMIN_PASS_HASH (الأفضل) أو ADMIN_PASS (تطوير) */
const passHash = (process.env.ADMIN_PASS_HASH || "").trim();
const passPlain = process.env.ADMIN_PASS || "";

if (isProd) {
  if (!passHash && !passPlain) {
    throw new Error("[security] حدّد ADMIN_PASS_HASH (مفضّل) أو ADMIN_PASS في .env للإنتاج.");
  }
  if (passPlain && passPlain.length < 8) {
    throw new Error("[security] ADMIN_PASS قصير جداً (8 أحرف على الأقل) للإنتاج.");
  }
  if (passPlain.toLowerCase() === "admin123") {
    throw new Error("[security] ADMIN_PASS الافتراضي 'admin123' مرفوض في الإنتاج.");
  }
  if (passHash && !passHash.startsWith("scrypt$") && !passHash.startsWith("vv:")) {
    throw new Error("[security] صيغة ADMIN_PASS_HASH غير صالحة (المتوقع scrypt$... أو قديمة vv:...).");
  }
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
export const ADMIN_PASS_HASH = passHash;
export const ADMIN_PASS_PLAIN = passPlain;
export const PROD = isProd;

/** رموز البوت — تُتحقَّق في الويبهوك بدل قبول أي طلب */
export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
export const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

/** قائمة الأسرار الضعيفة — للاختبارات */
export const isWeakSecret = isWeak;
export const FORBIDDEN_SECRETS = FORBIDDEN;

/**
 * يطبع تقريراً واحداً عند الإقلاع يوضح ما هو آمن وما هو ناقص.
 * لا يرمي — حتى يبقى التطوير مريحاً، لكن Production يفشل عبر resolveSecret.
 */
export function securityReport() {
  const weak = [];
  if (isWeak(process.env.JWT_SECRET)) weak.push("JWT_SECRET");
  if (!ADMIN_PASS_HASH && (!ADMIN_PASS_PLAIN || ADMIN_PASS_PLAIN.length < 8)) weak.push("ADMIN_PASS");
  if (!TELEGRAM_TOKEN) weak.push("TELEGRAM_BOT_TOKEN");
  if (!WHATSAPP_VERIFY_TOKEN) weak.push("WHATSAPP_VERIFY_TOKEN");
  if (weak.length) {
    console.warn(
      `[security] عناصر ضعيفة/ناقصة: ${weak.join(", ")}\n` +
      `          في الإنتاج تُرفض تماماً. راجع SECURITY.md.`
    );
  }
  return weak;
}
