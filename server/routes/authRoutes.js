// ─────────────────────────────────────────────
// Public Auth — تسجيل/دخول المستخدمين + نقاط المكافآت 🏆
// +50 عند التسجيل • +10 لكل تحميل مكتمل • +1 لكل معاينة
// ─────────────────────────────────────────────
import { Router } from "express";
import { randomBytes } from "crypto";
import { signUser, requireUser } from "../middleware/adminAuth.js";
import { db } from "../services/db.js";
import { verifyPassword, validatePassword, validateEmail, hashPassword } from "../config/passwords.js";

const r = Router();

/* تجزئة وهمية تُحسب مرّة واحدة: بدونها كان الرد على بريد غير موجود أسرع
   بوضوح (بلا scrypt) ⇒ تسريب وجود الحسابات عبر توقيت الاستجابة. */
const DUMMY_HASH = hashPassword(randomBytes(24).toString("hex"));

/** لا يخرج أي hash مع التوكن/الرد */
const publicUser = (u = {}) => {
  const { password: _pw, ...pub } = u;
  return pub;
};

r.post("/register", async (req, res) => {
  try {
    const { email, password = "" } = req.body || {};
    const mail = validateEmail(email);
    if (!mail.ok) return res.status(400).json({ error: mail.error });
    const pw = validatePassword(password);
    if (!pw.ok) return res.status(400).json({ error: pw.error });
    const u = await db.createUser({ email: mail.email, password, role: "user" });
    const points = await db.addPoints(u.id, 50); // 🎁 بونص الترحيب
    const pub = publicUser({ ...u, points });
    res.json({ token: signUser(pub), user: pub });
  } catch (e) {
    // 409 للبريد المكرر (db يرمي خطأً موسوماً) — لا نسرّب نص Prisma
    const status = e?.status || 400;
    res.status(status).json({ error: status === 409 ? "هذا البريد مسجّل مسبقاً" : e?.expose ? e.message : "تعذّر إنشاء الحساب" });
  }
});

r.post("/login", async (req, res) => {
  const { email, password = "" } = req.body || {};
  const u = await db.findUserByEmail(String(email || "").trim().toLowerCase(), true);
  // ⚠️ رسالة واحدة لكل الفشل (لا نميّز "بريد غير موجود" عن "كلمة خاطئة")
  // ونتحقق دائماً — حتى لمستخدم غير موجود — عبر تجزئة وهمية، حتى لا يكشف
  // توقيت الاستجابة وجود الحساب.
  const check = verifyPassword(password, u?.password || DUMMY_HASH);
  if (!u || !check.ok) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  // ترقية تلقائية: إن كانت الكلمة مخزّنة بـSHA-256 القديم ⇒ نعيد التجزئة بـscrypt
  if (check.needsUpgrade) await db.updatePassword(u.id, password).catch(() => {});
  const pub = publicUser(u);
  res.json({ token: signUser(pub), user: pub });
});

r.get("/me", requireUser, async (req, res) => {
  // نبحث بالمعرّف أولاً (لا يتأثر بتغيير البريد) مع الرجوع للبريد للتوكنات القديمة
  const u = (await db.findUserById(req.user.sub)) || (await db.findUserByEmail(req.user.email || ""));
  if (!u) return res.status(404).json({ error: "غير موجود" });
  res.json(publicUser(u));
});

export default r;
