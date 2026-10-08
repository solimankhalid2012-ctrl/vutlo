// ─────────────────────────────────────────────────────────
// Rating — تقييم الموقع بالنجوم: رقم حقيقي يُحسب من التصويت لا رقم مزروع.
//
//   GET  /api/rating   ⇒ { count, average, by: {1..5} }
//   POST /api/rating   ⇒ { stars: 1..5, clientId }  ⇒ يعيد الإحصاء بعد الحفظ
//
// لماذا معرّف متصفح لا حساب؟ التصويت متاح للزوار، وربطه بالحساب كان
// سيبقي العدّاد = عدد الأعضاء فقط. معرّف عشوائي في localStorage يكفي
// للحدّ من التكرار، ولا نخزّن أي معرّف يسمح بتتبّع المستخدم — ولا IP.
// ولماذا upsert في الخادم؟ لو غيّر رأيه لاحقاً يُحدَّث سطره ولا يزيد
// العدّاد، وإلا صار العدّاد = عدد الضغطات لا عدد المقيّمين.
// ─────────────────────────────────────────────────────────
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ipKey } from "../config/rateKeys.js";
import { db } from "../services/db.js";

export const ratingRoutes = Router();

/** منع الحشو: التصويت المسموح هو اختيار تغيير رأي بضع مرّات لا آلاف. */
const ratingLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: Number(process.env.RATING_MAX_PER_10MIN || 30),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة — أعد المحاولة بعد دقائق" },
});

/** الإحصاءات الحالية — تصل إلى الصفحة الرئيسية قبل أي تصويت */
ratingRoutes.get("/", async (_req, res) => {
  try {
    res.json(await db.ratingStats());
  } catch (e) {
    console.error("[rating] stats:", e?.message || e);
    res.status(500).json({ error: "تعذّر قراءة التقييمات" });
  }
});

/** التصويت/تغيير الرأي — التحقق من القيمة في الطبقتين (الخادم المرجع) */
ratingRoutes.post("/", ratingLimiter, async (req, res) => {
  try {
    const { stars, clientId } = req.body || {};
    res.json(await db.saveRating(clientId, stars));
  } catch (e) {
    const status = Number.isInteger(e?.status) ? e.status : 500;
    if (status >= 500) console.error("[rating] save:", e?.message || e);
    res.status(status).json({ error: e?.expose ? e.message : "تعذّر حفظ التقييم" });
  }
});

export default ratingRoutes;
