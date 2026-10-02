// ─────────────────────────────────────────────
// planGate — حدود الخطة (Free حتى 1080p، Pro حتى 8K)
// مصدر واحد يستخدمه /api/download و /api/schedule معاً حتى لا تتفرّق القاعدة.
// ─────────────────────────────────────────────
import { qualityHeight } from "./ytdlpService.js";

export const FREE_MAX_HEIGHT = 1080;

/** رسالة الرفض الموحّدة (نفس النص في كل نقطة) */
export const QUALITY_DENIED = {
  error: "أعلى جودة في الخطة المجانية 1080p — ترقية Pro ($4.99/شهر) لفتح 4K و8K",
  plan: "free",
  maxQuality: "1080p",
};

/** هل تسمح الخطة بهذه الجودة؟ Pro/admin تحصل على كل شيء. */
export function planAllowsQuality(quality, isPro) {
  if (isPro) return true;
  return qualityHeight(quality) <= FREE_MAX_HEIGHT;
}
