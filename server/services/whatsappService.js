// ─────────────────────────────────────────────
// whatsappService — تكامل WhatsApp (Cloud API الرسمية)
// الإعداد: WHATSAPP_TOKEN + WHATSAPP_PHONE_ID في .env
// Webhook verify: GET /api/bot/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// استقبال: POST /api/bot/whatsapp?hub.verify_token=... (نفس التوكن — Meta لا يوقّع الطلبات)
// docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// ⚠️ كان التوكن الافتراضي "vutlo-verify" قيمة معروفة ⇒ أي شخص كان يتحقق
//   من الـwebhook. الآن لا قيمة افتراضية إطلاقاً + مقارنة ثابتة الزمن.
// ─────────────────────────────────────────────
import { getVideoInfo, queueDownload } from "./ytdlpService.js";
import { safeEqual } from "../config/passwords.js";
import { safeJson } from "../config/safeJson.js";

const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || "";

/** أرقام مسموح لها فقط (فارغة = لا قيود) */
const ALLOWED = new Set(
  (process.env.WHATSAPP_ALLOWED_CHATS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const MAX_PER_WINDOW = Math.max(1, Number(process.env.BOT_MAX_PER_MIN) || 3);
const WINDOW_MS = 60_000;

const hits = new Map();

const api = () => `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

async function wa(to, text) {
  if (!TOKEN || !PHONE_ID) throw new Error("ضع WHATSAPP_TOKEN و WHATSAPP_PHONE_ID في .env");
  const r = await fetch(api(), {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return safeJson(r);
}

const say = (to, text) => wa(to, text).catch(() => {});

const chatAllowed = (id) => ALLOWED.size === 0 || ALLOWED.has(String(id).replace(/^\+/, ""));

function withinLimit(id) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(id, list);
    return false;
  }
  list.push(now);
  hits.set(id, list);
  return true;
}

/** GET verification — مقارنة ثابتة الزمن حتى لا تكشف سرعة الردّ ما إذا طابق */
export function verifyWhatsappWebhook(query) {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": ch } = query || {};
  if (!VERIFY || mode !== "subscribe") return { ok: false };
  if (!safeEqual(String(token ?? ""), VERIFY)) return { ok: false };
  return { ok: true, challenge: ch };
}

/** POST — نفس التوكن (query) لأن Meta لا ترسل توقيعاً على الطلبات */
export function whatsappPostAllowed(query) {
  if (!VERIFY) return false;
  return safeEqual(String(query?.["hub.verify_token"] ?? ""), VERIFY);
}

export async function handleWhatsappUpdate(body) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg?.text?.body) return { ok: true, ignored: true };
  const from = msg.from;
  const text = msg.text.body.trim();

  if (!chatAllowed(from)) {
    await say(from, "⛔ هذا البوت مغلق حالياً — تواصل عبر support@vutlo.com");
    return { ok: true, blocked: true };
  }
  if (!withinLimit(from)) {
    await say(from, "🐌 طلبات كثيرة — انتظر دقيقة ثم أعد المحاولة.");
    return { ok: true, throttled: true };
  }

  const link = (text.match(/https?:\/\/\S+/) || [])[0];
  if (!link) {
    await say(from, "🔗 أرسل رابط فيديو من فضلك — Vutlo ✨");
    return { ok: true };
  }

  await say(from, "⏳ نحلّل الرابط…");
  try {
    const info = await getVideoInfo(link);
    const job = await queueDownload(link, { quality: "720p", format: "mp4" });
    await say(from, `🎬 ${info.title}\n⏱ ${info.duration}\n⬇ بدأ التحميل (مهمة ${job.jobId})`);
    return { ok: true, jobId: job.jobId };
  } catch (e) {
    console.error("[whatsapp]", e?.message || e);
    await say(from, e?.expose ? `⚠️ ${e.message}` : "⚠️ تعذّر معالجة الرابط — جرّب رابطاً عاماً آخر.");
    return { ok: false };
  }
}
