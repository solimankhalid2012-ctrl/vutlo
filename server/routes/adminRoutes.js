// ─────────────────────────────────────────────
// Admin API — دخول JWT + إحصائيات + مستخدمون + خطط الاشتراك
// كل المسارات بعد /login محمية بـ requireAdmin
// ─────────────────────────────────────────────
import { Router } from "express";
import { signAdmin, requireAdmin, verifyAdminPassword } from "../middleware/adminAuth.js";
import { ADMIN_EMAIL } from "../config/security.js";
import { safeEqual } from "../config/passwords.js";
import { db } from "../services/db.js";
import { listJobs } from "../services/ytdlpService.js";
import { listSchedules } from "../services/schedulerService.js";

const r = Router();

// ── دخول الأدمن ──
// ⚠️ لا مقارنة نصية للكلمة، ولا رد يفاضل بين "بريد خاطئ" و"كلمة خاطئة"
// (Message ثابت دائماً حتى لا نُمهّد ل attacks تخمين البريد).
r.post("/login", (req, res) => {
  const { email = "", password = "" } = req.body || {};
  const emailOk = safeEqual(String(email).trim().toLowerCase(), ADMIN_EMAIL);
  const passOk = verifyAdminPassword(String(password));
  if (emailOk && passOk) return res.json({ token: signAdmin(ADMIN_EMAIL), email: ADMIN_EMAIL });
  res.status(401).json({ error: "بيانات دخول الأدمن غير صحيحة" });
});

r.use(requireAdmin);

// ── إحصائيات اللوحة ──
r.get("/stats", async (req, res) => {
  const hist = await db.getHistory(1000);
  const jobs = listJobs();
  const sch = listSchedules();
  const dls = hist.filter((h) => h.kind === "download");
  const byFormat = {};
  dls.forEach((h) => { byFormat[h.format || "?"] = (byFormat[h.format || "?"] || 0) + 1; });
  const users = await db.listUsers();
  res.json({
    mode: db.mode(),
    totals: {
      previews: hist.filter((h) => h.kind === "preview").length,
      downloads: dls.length,
      users: users.length,
      pro: users.filter((u) => u.plan === "pro").length,
    },
    byFormat,
    jobs: {
      active: jobs.filter((j) => ["queued", "downloading"].includes(j.status)),
      done: jobs.filter((j) => j.status === "done").length,
      error: jobs.filter((j) => j.status === "error").length,
    },
    schedulesPending: sch.filter((s) => s.status === "pending").length,
    uptimeSec: Math.round(process.uptime()),
  });
});

r.get("/jobs", (req, res) => res.json(listJobs()));
// ⚠️ limit كان يُمرَّر كما هو ⇒ ?limit=1000000 يعيد جدولاً كاملاً ويقتل الاستعلام
r.get("/recent", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
  res.json(await db.getHistory(limit));
});

// ── المستخدمون ──
r.get("/users", async (req, res) => res.json(await db.listUsers()));
r.post("/users", async (req, res) => {
  try { res.json(await db.createUser(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete("/users/:id", async (req, res) => {
  if (!(await db.deleteUser(req.params.id))) return res.status(404).json({ error: "غير موجود" });
  res.json({ ok: true });
});

// ── 💎 الخطة: free (حتى 1080p) / pro (بلا إعلانات + فوق 1080p) ──
r.patch("/users/:id/plan", async (req, res) => {
  try {
    if (!(await db.setUserPlan(req.params.id, req.body?.plan)))
      return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json({ ok: true, plan: req.body.plan });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default r;
