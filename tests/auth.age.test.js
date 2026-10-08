/**
 * 🔞 تسجيل الحساب مع العمر — server/routes/authRoutes.js
 *
 * نركّب موجّه auth وحده على خادم Express مؤقّت (لا نستورد server.js كاملاً
 * لأنه يستمع على منفذ ثابت عند الاستيراد ⇒ تسريب في الاختبارات).
 *
 * لماذا نختبر الخادم لا الواجهة فقط؟ لأن حدّ العمر قانون على الحساب: أي
 * عميل (سكربت، curl، تطبيق قديم) يمرّ من هنا، فالتحقق يجب أن يكون هنا —
 * min/max في <input> على المتصفح زينة لا حاجز.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";import express from "express";
import { AGE_MIN, AGE_MAX } from "../server/routes/authRoutes.js";
import { db } from "../server/services/db.js";

const PW = "vv-K9x2mQ7wLp";
let server;
let base;
const created = [];

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

beforeAll(async () => {
  const authRoutes = (await import("../server/routes/authRoutes.js")).default;
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/auth", authRoutes);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  for (const u of created) await db.deleteUser(u).catch(() => {});
  await new Promise((r) => server.close(r));
});

describe("عمر الحساب — يُفرض على الخادم", () => {
  it("يرفض عمراً أقل من الحدّ الأدنى", async () => {
    const r = await post("/api/auth/register", {
      email: "young@test.invalid", password: PW, age: AGE_MIN - 1,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(new RegExp(String(AGE_MIN)));
  });

  it("يرفض عمراً أكبر من الحدّ الأقصى", async () => {
    const r = await post("/api/auth/register", {
      email: "old@test.invalid", password: PW, age: AGE_MAX + 1,
    });
    expect(r.status).toBe(400);
  });

  it("يرفض العمر الناقص/غير الرقمي بدل تخمين قيمة", async () => {
    for (const age of [undefined, null, "", "abc", 0, -5]) {
      const r = await post("/api/auth/register", {
        email: `probe${Math.random().toString(36).slice(2, 8)}@test.invalid`, password: PW, age,
      });
      expect(r.status, `age=${JSON.stringify(age)}`).toBe(400);
    }
  });

  it("يرفض كسراً (13.5) ولا يقرّبه إلى 13", async () => {
    // ⚠️ كنا نقرّب بـMath.round ⇒ 13.5 كان يُحفظ 13 ⇒ قيمة صامتة خاطئة
    const r = await post("/api/auth/register", {
      email: "frac@test.invalid", password: PW, age: 13.5,
    });
    expect(r.status).toBe(400);
  });

  it("يقبل عمراً صحيحاً ويحفظه مع +50 نقطة ترحيب", async () => {    const email = `ok${Date.now()}@test.invalid`;
    const r = await post("/api/auth/register", { email, password: PW, age: 27 });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.age).toBe(27);
    expect(r.body.user.password).toBeUndefined();
    expect(r.body.user.points).toBe(50);
    created.push(r.body.user.id);

    // وواجهة /api لا تسقط العمر عند القراءة
    const found = await db.findUserByEmail(email);
    expect(found?.age).toBe(27);
  });

  it("العمر يُقبل كسلسلة نصية (نموذج HTML يرسل نصاً)", async () => {
    const email = `str${Date.now()}@test.invalid`;
    const r = await post("/api/auth/register", { email, password: PW, age: "31" });
    expect(r.status).toBe(200);
    expect(r.body.user.age).toBe(31);
    created.push(r.body.user.id);
  });
});
