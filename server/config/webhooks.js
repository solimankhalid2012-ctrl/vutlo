// ─────────────────────────────────────────────
// config/webhooks.js — تحقّق هوية webhook للناشرين
// Telegram وWhatsApp: أي حدّ بلا تحقق = واجهة عامة تشغّل البوت بلا حدود.
// ─────────────────────────────────────────────
import { TELEGRAM_WEBHOOK_SECRET, WHATSAPP_VERIFY_TOKEN, PROD } from "./security.js";
import { safeEqual } from "./passwords.js";

/**
 * مبدأ: fail-closed افتراضياً.
 * إن لم يُضبط السر نرفض الطلب (حتى لو كان التطوير) — لأن نقطة webhook مفتوحة
 * تعني تشغيل yt-dlp لأي شخص. التطوير الطفيف متاح عبر
 * ALLOW_UNVERIFIED_WEBHOOKS=1 صراحةً.
 */
const DEV_ALLOW = process.env.ALLOW_UNVERIFIED_WEBHOOKS === "1";

/**
 * تيليجرام: عند ضبط Webhook مع secret_token ترسل تيليجرام
 * الترويسة X-Telegram-Bot-Api-Secret-Token مع كل طلب.
 */
export function telegramWebhookOk(header) {
  if (!TELEGRAM_WEBHOOK_SECRET) return !PROD && DEV_ALLOW;
  return safeEqual(String(header || ""), TELEGRAM_WEBHOOK_SECRET);
}

/**
 * WhatsApp: التحقق يتم وقت الربط (GET) عبر hub.verify_token.
 * أما POST (الرسائل) فلا يوقّعه ميتا، فنطلب نفس التوكن ونرفض المجهول.
 */
export function whatsappWebhookOk(query) {
  if (!WHATSAPP_VERIFY_TOKEN) return !PROD && DEV_ALLOW;
  return safeEqual(String(query?.["hub.verify_token"] || ""), WHATSAPP_VERIFY_TOKEN);
}
