// ─────────────────────────────────────────────
// telegramBot — تكامل Telegram Bot (بدون مكتبات: fetch الأصلي)
// الإعداد: ضع TELEGRAM_BOT_TOKEN في .env ثم فعّل Webhook نحو:
//   POST https://your-api.com/api/bot/telegram
//
// الحماية (البوت واجهة عامة ⇒ لا يُترك مفتوحاً):
// • حدّ رسائل لكل محادثة (BOT_MAX_PER_MIN) يمنع تحويله إلى خدمة yt-dlp مجانية
// • قائمة مسموح اختيارية (TELEGRAM_ALLOWED_CHATS) — فارغة = مفتوح للجميع
// • كل خطأ يُطبع في السجل ويُعاد للمستخدم نص عام (لا تفاصيل داخلية)
// ─────────────────────────────────────────────
import { getVideoInfo, queueDownload, getJob } from "./ytdlpService.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const api = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

/** معرّفات المحادثات المسموح لها (فارغة = لا قيود) */
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_CHATS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const MAX_PER_WINDOW = Math.max(1, Number(process.env.BOT_MAX_PER_MIN) || 3);
const WINDOW_MS = 60_000;

/** نافذة الطلبات لكل محادثة: Map<chatId, number[]> */
const hits = new Map();
/** مهمة started ⇒ أي محادثة تملكها (حتى لا يستعلم غريب عن تقدّمها) */
const chatJobs = new Map();

const chatAllowed = (id) => ALLOWED.size === 0 || ALLOWED.has(String(id));

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

async function tg(method, payload) {
  if (!TOKEN) throw new Error("ضع TELEGRAM_BOT_TOKEN في .env");
  const r = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

const say = (chatId, text) => tg("sendMessage", { chat_id: chatId, text }).catch(() => {});

/** معالجة رسالة واردة: /start أو /job <id> أو رابط فيديو */
export async function handleTelegramUpdate(update) {
  const msg = update?.message;
  if (!msg?.text) return { ok: true, ignored: true };
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === "/start") {
    await say(
      chatId,
      "👋 أهلاً بك في VideoVault Pro Bot\n\nأرسل رابط أي فيديو (YouTube / TikTok / Instagram…) وسأجهّزه لك بجودة عالية وبدون علامة مائية ✨\n\nتابع المهمة بأمر: /job <رقم المهمة>"
    );
    return { ok: true };
  }

  // 📊 متابعة مهمة — للمالك فقط (المعرّفات عشوائية لكن الخطوة لا تُترك للعابثين)
  const jobCmd = text.match(/^\/job\s+(\S+)$/);
  if (jobCmd) {
    const jobId = jobCmd[1];
    if (chatJobs.get(jobId) !== chatId) {
      await say(chatId, "🔒 لا أملك هذه المهمة — أرسل الرابط من جديد.");
      return { ok: true, denied: true };
    }
    const j = getJob(jobId);
    if (!j) {
      await say(chatId, "⌛ انتهت صلاحية المهمة.");
      return { ok: true };
    }
    if (j.status === "done") await say(chatId, `✅ انتهى التحميل: ${j.fileUrl || "—"}`);
    else if (j.status === "error") await say(chatId, "❌ فشل التحميل — جرّب رابطاً آخر.");
    else await say(chatId, `⏳ ${Math.round(j.progress || 0)}% — ${j.stage || "downloading"}`);
    return { ok: true };
  }

  if (!chatAllowed(chatId)) {
    await say(chatId, "⛔ هذا البوت مغلق حالياً — تواصل عبر support@videovaultpro.com");
    return { ok: true, blocked: true };
  }
  if (!withinLimit(chatId)) {
    await say(chatId, "🐌 طلبات كثيرة منك — انتظر دقيقة ثم أعد المحاولة.");
    return { ok: true, throttled: true };
  }

  const link = (text.match(/https?:\/\/\S+/) || [])[0];
  if (!link) {
    await say(chatId, "🔗 أرسل رابط فيديو صالحاً من فضلك.");
    return { ok: true };
  }

  await say(chatId, "⏳ نحلّل الرابط…");
  try {
    const info = await getVideoInfo(link);
    const job = await queueDownload(link, { quality: "1080p", format: "mp4" });
    chatJobs.set(job.jobId, chatId);
    await say(
      chatId,
      `🎬 ${info.title}\n⏱ المدة: ${info.duration}\n👤 ${info.uploader || "—"}\n\n⬇ بدأ التحميل\nتابع التقدم: /job ${job.jobId}`
    );
    return { ok: true, jobId: job.jobId };
  } catch (e) {
    // ⚠️ ما كان خطأً (رابط خاص/محجوب) مفيد للمستخدم، وما كان خطأ داخلياً لا يُكشف
    console.error("[telegram]", e?.message || e);
    await say(chatId, e?.expose ? `⚠️ ${e.message}` : "⚠️ تعذّر معالجة الرابط — جرّب رابطاً عاماً آخر.");
    return { ok: false };
  }
}
