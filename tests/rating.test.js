/**
 * ⭐ تقييم الموقع بالنجوم — server/routes/ratingRoutes.js
 *
 * الثغرة التي تحرسها: العدّاد = عدد المقيّمين لا عدد الضغطات.
 * لو كتب المتصفح صوتاً جديداً في كل نقرة، لصار الرقم الذي تعرضه الصفحة
 * عدّاد إعجابات متصفح واحد (ويسهل رفعه بسكربت). لذلك الحفظ upsert
 * بمعرّف المتصفح في الخادم — وهذا الاختبار يثبته على مستوى الـAPI، لا
 * على مستوى الواجهة وحدها.
 *
 * نركّب الموجّه وحده على Express (لا نستورد server.js كاملاً لأنه يستمع
 * على منفذ ثابت عند الاستيراد). نظّف أصواتنا بعد الاختبار حتى لا تتلوّث
 * إحصاءات البيئة الحقيقية.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { db } from "../server/services/db.js";

let server;
let base;

/** معرّفات فريدة لكل تشغيل — حتى لا تتعارض مع أصوات سابقة */
const C1 = `vitest-r1-${Math.random().toString(36).slice(2, 12)}`;
const C2 = `vitest-r2-${Math.random().toString(36).slice(2, 12)}`;

const get = async () => {
  const res = await fetch(`${base}/api/rating`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const post = async (body) => {
  const res = await fetch(`${base}/api/rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

/** مجموع النجوم من التوزيع — للمطابقة مع المتوسط المعروض */
const sumOf = (by) =>
  Object.entries(by).reduce((acc, [stars, n]) => acc + Number(stars) * Number(n), 0);

beforeAll(async () => {
  const { default: ratingRoutes } = await import("../server/routes/ratingRoutes.js");
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/rating", ratingRoutes);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await db.deleteRating(C1).catch(() => {});
  await db.deleteRating(C2).catch(() => {});
  await new Promise((r) => server.close(r));
});

describe("GET /api/rating — إحصاء متطابق مع نفسه", () => {
  it("يعيد {count, average, by} والمتوسط محسوب من التوزيع لا من رياضيات أخرى", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toHaveProperty("count");
    expect(body).toHaveProperty("average");
    expect(body).toHaveProperty("by");
    for (let n = 1; n <= 5; n++) expect(typeof body.by[n]).toBe("number");

    const expected = body.count
      ? Math.round((sumOf(body.by) / body.count) * 10) / 10
      : 0;
    expect(body.average).toBe(expected);
    expect(Object.values(body.by).reduce((a, b) => a + b, 0)).toBe(body.count);
  });
});

describe("POST /api/rating — العدّاد يقيّم الناس لا النقرات", () => {
  it("التصويت الأول يزيد العدّاد واحداً ويظهر في التوزيع", async () => {
    const before = await get();
    const r = await post({ stars: 5, clientId: C1 });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(before.body.count + 1);
    expect(r.body.by[5]).toBe(before.body.by[5] + 1);
  });

  it("تغيير الرأي يحدّث التوزيع ولا يزيد العدّاد (upsert بمعرّف المتصفح)", async () => {
    const before = await get();
    const r = await post({ stars: 3, clientId: C1 }); // نفس المتصفح، رأي آخر
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(before.body.count); // ← العدّاد لم يتضاعف
    expect(r.body.by[5]).toBe(before.body.by[5] - 1);
    expect(r.body.by[3]).toBe(before.body.by[3] + 1);
  });

  it("معرّف آخر = صوت آخر", async () => {
    const before = await get();
    const r = await post({ stars: 4, clientId: C2 });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(before.body.count + 1);
    expect(r.body.by[4]).toBe(before.body.by[4] + 1);
  });

  it("العدّاد لا يتجاوز عدد المتصفحات مهما تكرّر التصويت", async () => {
    const start = (await get()).body.count;
    for (const stars of [1, 2, 5, 5, 3]) {
      const r = await post({ stars, clientId: C2 });
      expect(r.status).toBe(200);
      expect(r.body.count).toBe(start);
    }
    const end = await get();
    expect(end.body.count).toBe(start);
    expect(end.body.by[3]).toBeGreaterThan(0);
  });
});

describe("POST /api/rating — التحقق من المدخلات في الخادم", () => {
  it("يرفض نجوماً خارج 1..5 وبشريطاً غير رقمي", async () => {
    for (const stars of [0, 6, 9, -1, 3.5, null, undefined, "abc"]) {
      const r = await post({ stars, clientId: C1 });
      expect(r.status, `stars=${String(stars)}`).toBe(400);
      expect(typeof r.body.error).toBe("string");
    }
  });

  it("يرفض معرّفاً قصيراً أو غائباً (لا يُكتب سطر بلا هوية)", async () => {
    const a = await post({ stars: 4, clientId: "x" });
    expect(a.status).toBe(400);
    const b = await post({ stars: 4 });
    expect(b.status).toBe(400);
    const c = await post({ stars: 4, clientId: "   " });
    expect(c.status).toBe(400);
  });

  it("جسم غير صالح لا يُسقط الخادم ويعود 400", async () => {
    const r = await post("not-json");
    expect(r.status).toBe(400);
    // الطلب التالي يثبت أن الموجّف ما زال حيّاً بعد رفض الجسم
    expect((await get()).status).toBe(200);
  });
});
