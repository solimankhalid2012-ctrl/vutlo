// ─────────────────────────────────────────────
// db.js — طبقة قاعدة البيانات
// Prisma + SQLite افتراضياً (ملف دائم prisma/dev.db)،
// ويقبل PostgreSQL عبر DATABASE_URL، مع وضع ذاكرة كشبكة أمان.
// (نفس الواجهة في الحالات الثلاث — الكود الأعلى لا يتغير)
// ─────────────────────────────────────────────
import { hashPassword, validateEmail, validatePassword } from "../config/passwords.js";

let prisma = null;
let mode = "memory";

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/* ⚠️ كان هنا حساب أدن مزيّف بكلمة سر فارغة ⇒ في وضع الذاكرة كان يكفي أي بريد
   وكلمة فارغة لدخول كـadmin. كلمة سر الأدن الحقيقية تُدار عبر ADMIN_PASS_HASH
   في .env ولا علاقة لها بجدول المستخدمين. */
const mem = {
  history: [],
  users: [],
  schedules: [],
};

/** خطأ موحّد: 409 للبريد المكرر و400 لبقية أخطاء الإدخال (بدل تسريب Prisma) */
const dbError = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
};

/** خيارات الجدولة تُخزَّن كسلسلة JSON لأن SQLite لا يدعم نوع Json */
const parseOptions = (raw) => {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
};

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[db] لا يوجد DATABASE_URL → وضع الذاكرة (البيانات مؤقتة!)");
    return;
  }
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.$connect();
    mode = url.startsWith("file:") ? "sqlite" : "postgres";
    console.log(`[db] Connected — ${mode.toUpperCase()} + Prisma ✅`);
  } catch (e) {
    prisma = null;
    mode = "memory";
    console.error("[db] فشل الاتصال بـPrisma → وضع الذاكرة:", e.message);
  }
}

/** إعادة تصدير للتوافق — المصدر الحقيقي في config/passwords.js (scrypt) */
export { hashPassword };

export const db = {
  mode: () => mode,

  // ── السجل ──
  async logHistory(e) {
    if (prisma) {
      try {
        await prisma.download.create({
          data: {
            url: e.url, title: e.title || "", thumbnail: e.thumbnail || "",
            format: e.format || "", quality: e.quality || "",
            kind: e.kind || "preview", status: e.status || "done",
            userId: e.userId || null, // 👤 لازم لعزل سجل كل مستخدم
          },
        });
        return;
      } catch (err) {
        // ⚠️ كان يُبتلع بصمت ⇒ السجل يضيع دون أي أثر
        console.error("[db] logHistory:", err?.message || err);
        return;
      }
    }
    mem.history.unshift({ id: uid("h"), at: Date.now(), ...e });
    mem.history = mem.history.slice(0, 500);
  },
  /** سجل مستخدم واحد فقط — يمنع تسريب سجل الآخرين عبر /api/history */
  async getHistoryForUser(userId, limit = 100) {
    if (!userId) return [];
    if (prisma) {
      try {
        const rows = await prisma.download.findMany({
          where: { userId }, orderBy: { createdAt: "desc" }, take: limit,
        });
        return rows.map((r) => ({
          id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail,
          format: r.format, quality: r.quality, kind: r.kind, status: r.status,
          userId: r.userId || null,
          at: new Date(r.createdAt).getTime(),
        }));
      } catch {}
    }
    return mem.history.filter((h) => h.userId === userId).slice(0, limit);
  },
  async getHistory(limit = 100) {
    if (prisma) {
      try {
        const rows = await prisma.download.findMany({ orderBy: { createdAt: "desc" }, take: limit });
        return rows.map((r) => ({
          id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail,
          format: r.format, quality: r.quality, kind: r.kind, status: r.status,
          userId: r.userId || null,
          at: new Date(r.createdAt).getTime(),
        }));
      } catch {}
    }
    return mem.history.slice(0, limit);
  },

  // ── المستخدمون ──
  async listUsers() {
    if (prisma) {
      try {
        return (await prisma.user.findMany({ orderBy: { createdAt: "desc" } }))
          .map((u) => ({ id: u.id, email: u.email, role: u.role, points: u.points, plan: u.plan || "free", createdAt: new Date(u.createdAt).getTime() }));
      } catch {}
    }
    return mem.users.map(({ password, ...u }) => u);
  },
  async createUser({ email, password = "", role = "user", plan = "free" }) {
    const mail = validateEmail(email);
    if (!mail.ok) throw dbError(mail.error);
    // ⚠️ بدون تحقق كان بإمكان الأدن (أو أي نداء داخلي) إنشاء حساب بكلمة سر فارغة
    const pw = validatePassword(password);
    if (!pw.ok) throw dbError(pw.error);
    if (!["user", "admin"].includes(role)) throw dbError("دور غير صالح");
    if (!["free", "pro"].includes(plan)) throw dbError("خطة غير صالحة");
    if (prisma) {
      try {
        const u = await prisma.user.create({ data: { email: mail.email, password: hashPassword(password), role, plan } });
        return { id: u.id, email: u.email, role: u.role, points: u.points, plan: u.plan || "free" };
      } catch (e) {
        if (/unique|already exists/i.test(String(e?.message))) throw dbError("البريد مسجّل مسبقاً", 409);
        console.error("[db] createUser:", e?.message || e);
        throw dbError("تعذّر إنشاء الحساب", 500);
      }
    }
    if (mem.users.some((u) => u.email === mail.email)) throw dbError("البريد مسجّل مسبقاً", 409);
    const u = { id: uid("u"), email: mail.email, password: hashPassword(password), role, points: 0, plan, createdAt: Date.now() };
    mem.users.push(u);
    const { password: _pw, ...pub } = u;
    return pub;
  },
  async deleteUser(id) {
    if (prisma) { try { await prisma.user.delete({ where: { id } }); return true; } catch { return false; } }
    const n = mem.users.length;
    mem.users = mem.users.filter((u) => u.id !== id);
    return mem.users.length < n;
  },
  /** تحديث كلمة السر (للترقية من SHA-256 إلى scrypt) */
  async updatePassword(id, newPassword) {
    const hashed = hashPassword(newPassword);
    if (prisma) {
      try { await prisma.user.update({ where: { id }, data: { password: hashed } }); return true; } catch { return false; }
    }
    const u = mem.users.find((x) => x.id === id);
    if (!u) return false;
    u.password = hashed;
    return true;
  },
  /** بحث بالبريد (مع كلمة السر للتحقق) */
  async findUserByEmail(email, withPassword = false) {
    if (prisma) {
      try {
        const u = await prisma.user.findUnique({ where: { email } });
        if (!u) return null;
        return withPassword
          ? { id: u.id, email: u.email, password: u.password, role: u.role, points: u.points, plan: u.plan || "free" }
          : { id: u.id, email: u.email, role: u.role, points: u.points, plan: u.plan || "free" };
      } catch { return null; }
    }
    const u = mem.users.find((x) => x.email === email);
    if (!u) return null;
    const { password, ...pub } = u;
    return withPassword ? { ...pub, password } : pub;
  },
  async findUserById(id) {
    if (!id) return null;
    if (prisma) {
      try {
        const u = await prisma.user.findUnique({ where: { id } });
        return u ? { id: u.id, email: u.email, role: u.role, points: u.points, plan: u.plan || "free" } : null;
      } catch { return null; }
    }
    // ⚠️ كان يعيد كائن الذاكرة كاملاً ⇒ hash الكلمة ينتقل لأي مستدعٍ (تسريب عرضي)
    const u = mem.users.find((x) => x.id === id);
    if (!u) return null;
    const { password: _pw, ...pub } = u;
    return pub;
  },
  /** 💎 ترقية/تخفيض الخطة (free | pro) — تُدار من لوحة الأدمن */
  async setUserPlan(id, plan) {
    if (!["free", "pro"].includes(plan)) throw dbError("خطة غير صالحة");
    if (prisma) {
      try { await prisma.user.update({ where: { id }, data: { plan } }); return true; } catch { return false; }
    }
    const u = mem.users.find((x) => x.id === id);
    if (!u) return false;
    u.plan = plan;
    return true;
  },
  /** 🏆 إضافة نقاط */
  async addPoints(id, n) {
    if (prisma) {
      try {
        const u = await prisma.user.update({ where: { id }, data: { points: { increment: n } } });
        return u.points;
      } catch { return null; }
    }
    const u = mem.users.find((x) => x.id === id);
    if (!u) return null;
    u.points += n;
    return u.points;
  },

  // ── ⏰ المهام المجدولة ──
  async addSchedule(rec) {
    if (prisma) {
      try {
        await prisma.scheduledTask.create({
          data: {
            id: rec.id, url: rec.url, runAt: new Date(rec.runAt),
            options: JSON.stringify(rec.options || {}), status: rec.status || "pending",
            userId: rec.userId || null,
          },
        });
        return true;
      } catch { return false; }
    }
    mem.schedules.push({ ...rec, timer: undefined });
    return true;
  },
  async updateSchedule(id, patch) {
    if (prisma) {
      try {
        const data = {};
        if (patch.status !== undefined) data.status = patch.status;
        if (patch.jobId !== undefined) data.jobId = patch.jobId;
        if (patch.error !== undefined) data.error = patch.error;
        if (!Object.keys(data).length) return true;
        await prisma.scheduledTask.update({ where: { id }, data });
        return true;
      } catch { return false; }
    }
    const s = mem.schedules.find((x) => x.id === id);
    if (!s) return false;
    Object.assign(s, patch);
    return true;
  },
  async listSchedules() {
    if (prisma) {
      try {
        const rows = await prisma.scheduledTask.findMany({ orderBy: { runAt: "asc" } });
        return rows.map((r) => ({
          id: r.id, url: r.url, runAt: r.runAt.toISOString(),
          options: parseOptions(r.options), status: r.status,
          jobId: r.jobId || null, error: r.error || null,
          userId: r.userId || null,
          createdAt: new Date(r.createdAt).getTime(),
        }));
      } catch { return []; }
    }
    return mem.schedules.map(({ timer, ...pub }) => pub);
  },
  async deleteSchedule(id) {
    if (prisma) {
      try { await prisma.scheduledTask.delete({ where: { id } }); return true; } catch { return false; }
    }
    const n = mem.schedules.length;
    mem.schedules = mem.schedules.filter((x) => x.id !== id);
    return mem.schedules.length < n;
  },
};
