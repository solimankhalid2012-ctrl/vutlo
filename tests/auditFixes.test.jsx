/**
 * اختبارات انحدار لنتائج مراجعة الملفات — كل حالة هنا كانت عطلاً حقيقياً:
 * مسار /:lang كان يتجاهل اللغة، وoptions.headers كان يُسقط Authorization،
 * وlistJobs كان يرمي circular JSON بسبب retryTimer، وإلغاء الجدولة
 * كان يردّ 404 رغم نجاحه.
 *
 * ⚠️ احتُذفت اختبارات بوابة الخطة (planGate/402): أُزيل نظام الدفع
 * بالكامل عمداً، ولم يعد هناك حدّ جودة مرتبط بالخطة.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { act } from "react";

// ── 1) أدوات التنسيق ──
import { fmtBytes } from "../src/utils/formatters.js";
// ── 2) المهام: retryTimer لا يتسرب إلى JSON ──
import { listJobs, queueDownload, cancelJob, publicJob } from "../server/services/ytdlpService.js";

const json = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

let consoleErrors = [];
let unhandled = [];
const onRejection = (r) => unhandled.push(String(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 120) {
  for (let i = 0; i < 12; i++) await act(async () => { await wait(ms); });
}

describe("fmtBytes — الملفات الصغيرة", () => {
  it("لا يعرض 0 KB لملف صغير", () => {
    expect(fmtBytes(400)).not.toBe("0 KB");
    expect(fmtBytes(400)).toBe("0.4 KB");
  });
  it("يحافظ على السلوك القديم للملفات الكبيرة", () => {
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(2.6e6)).toBe("2.6 MB");
    expect(fmtBytes(3.2e9)).toBe("3.2 GB");
  });
  it("يتعامل مع القيم الفارغة/السالبة بلا NaN", () => {
    expect(fmtBytes(0)).toBe("0 KB");
    expect(fmtBytes(undefined)).toBe("0 KB");
    expect(fmtBytes(-5)).toBe("0 KB");
  });
});

describe("أزيل حدّ الخطة — كل الجودات متاحة بلا 402", () => {
  it("لا توجد بوابة خطة على الخادم", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    expect(existsSync("server/services/planGate.js")).toBe(false);
    const src = readFileSync("server/server.js", "utf8");
    expect(src).not.toMatch(/(import|from)[^\n]*planGate/);
    expect(src).not.toMatch(/await qualityGate\(/);
    // 402 كان يُستخدم لحجب الجودة فقط ⇒ لا يبقى أي 402 في مسار download/schedule
    expect(src).not.toMatch(/status\(402\)/);
  });
});

describe("listJobs / getJob — لا circular JSON", () => {
  it("retryTimer حيّ يكسر JSON على الكائن الخام", () => {
    // يثبت أن الخطر حقيقي وليس افتراضياً
    const timer = setTimeout(() => {}, 60_000);
    const raw = { jobId: "job_probe", status: "running", progress: 5, createdAt: 1, retryTimer: timer };
    expect(() => JSON.stringify(raw)).toThrow(/circular/i);
    clearTimeout(timer);
  });

  it("publicJob تحذف الحقول الحيّة وتُبقي بيانات العرض", () => {
    const timer = setTimeout(() => {}, 60_000);
    const raw = {
      jobId: "job_probe", status: "running", progress: 42, format: "mp4",
      createdAt: 123, child: { pid: 1 }, userId: "u1", retryTimer: timer,
    };
    const pub = publicJob(raw);
    clearTimeout(timer);

    expect(pub.retryTimer).toBeUndefined();
    expect(pub.child).toBeUndefined();
    expect(pub.userId).toBeUndefined();
    expect(pub.jobId).toBe("job_probe");
    expect(pub.progress).toBe(42);
    expect(() => JSON.stringify(pub)).not.toThrow();
  });

  it("listJobs لا تسرّب retryTimer لأي مهمة", async () => {
    const job = await queueDownload("https://example.invalid/probe", { quality: "1080p", format: "mp4" });
    try {
      const rows = listJobs();
      expect(() => JSON.stringify(rows)).not.toThrow();
      for (const r of rows) expect(r).not.toHaveProperty("retryTimer");
      const mine = rows.find((r) => r.jobId === job.jobId);
      expect(mine).toBeTruthy();
      expect(mine).not.toHaveProperty("child");
    } finally {
      cancelJob(job.jobId);
    }
  });
});

describe("مسار /:lang — كان يعرض الرئيسية ويتجاهل اللغة", () => {
  beforeAll(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    if (!globalThis.IntersectionObserver) {
      globalThis.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }], this); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
    }
    if (!globalThis.matchMedia) {
      globalThis.matchMedia = () => ({
        matches: false, addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      });
    }
    process.on("unhandledRejection", onRejection);
    document.body.innerHTML = '<div id="root"></div>';
    window.history.pushState({}, "", "/");
    await act(async () => { await import("../src/main.jsx"); });
    await settle(40);
  });

  afterAll(() => {
    process.off("unhandledRejection", onRejection);
    consoleErrors = [];
  });

  beforeEach(() => {
    consoleErrors = [];
    unhandled = [];
    // restoreMocks: true في vite.config.js ⇒ إعادة التركيب في كل اختبار
    globalThis.fetch = async (url) => json(String(url).includes("/api/auth/me") ? { error: "غير مصرح" } : {});
    vi.spyOn(console, "error").mockImplementation((...a) => {
      consoleErrors.push(a.map(String).join(" "));
    });
  });

  async function navigate(route) {
    await act(async () => {
      window.history.pushState({}, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await settle();
    return document.getElementById("root");
  }

  // ⚠️ نختبرdirection فعلياً: التطبيق يبدأ بلغة jsdom الافتراضية (en)،
  // فنتحقق من انتقال في الاتجاهين بدل تأكيد حالة ابتدائية صادفة.
  it("/ar يطبّق العربية و RTL", async () => {
    await navigate("/ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(localStorage.getItem("vv-lang")).toBe("ar");
    expect(window.location.pathname).toBe("/");
  });

  it("/en يعكس الاتجاه مرة أخرى (en ← ar)", async () => {
    await navigate("/en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("vv-lang")).toBe("en");
    expect(window.location.pathname).toBe("/");
  });

  it("مسار غير معروف يعود للرئيسية ولا يغيّر اللغة", async () => {
    const before = document.documentElement.lang;
    const root = await navigate("/not-a-language");
    expect(window.location.pathname).toBe("/");
    expect(document.documentElement.lang).toBe(before);
    expect(root.innerHTML.length).toBeGreaterThan(300);
  });

  it("تبديل اللغة عبر الرابط لا يطلق تحذيرات React", async () => {
    await navigate("/ar");
    await navigate("/en");
    await navigate("/he");
    const real = consoleErrors.filter(
      (e) => !e.includes("not wrapped in act") && !e.includes("ReactDOMTestUtils"),
    );
    expect(real).toEqual([]);
    expect(unhandled).toEqual([]);
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("طبقة الاتصال — options.headers لا تُسقط Authorization", () => {
  beforeEach(() => {
    globalThis.fetch = async () => json({ ok: true });
    localStorage.setItem("vv-token", "USER_TOKEN_123");
    localStorage.setItem("vv-admin-token", "ADMIN_TOKEN_456");
  });

  it("api.js يبقي التوكن رغم headers ممرّرة من المستدعي", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => { seen.push(opts?.headers); return json({}); };
    const { startDownload } = await import("../src/services/api.js");
    await startDownload("https://example.com/v", { quality: "1080p", format: "mp4" });
    expect(seen[0].Authorization).toBe("Bearer USER_TOKEN_123");
    expect(seen[0]["Content-Type"]).toBe("application/json");
  });

  it("adminApi يبقي توكن المدير", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => { seen.push(opts?.headers); return json([]); };
    const { adminStats } = await import("../src/services/adminApi.js");
    await adminStats();
    expect(seen[0].Authorization).toBe("Bearer ADMIN_TOKEN_456");
  });

  it("authApi يبقي توكن المستخدم", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => { seen.push(opts?.headers); return json({}); };
    const { me } = await import("../src/services/authApi.js");
    await me();
    expect(seen[0].Authorization).toBe("Bearer USER_TOKEN_123");
  });
});

describe("إلغاء الجدولة — لا 404 بعد نجاح الإلغاء", () => {
  it("مهمة في القاعدة فقط تُلغى بنجاح", async () => {
    const { db } = await import("../server/services/db.js");
    const { cancelSchedule } = await import("../server/services/schedulerService.js");
    const id = "sch_test_only_db";
    await db.addSchedule({
      id, url: "https://example.com/v", runAt: new Date(Date.now() + 864e5).toISOString(),
      options: {}, status: "pending",
    });
    expect(await cancelSchedule(id)).toBe(true);
    const rows = await db.listSchedules();
    expect(rows.find((r) => r.id === id)?.status).toBe("cancelled");
  });

  it("مهمة غير موجودة فعلاً ترفض", async () => {
    const { cancelSchedule } = await import("../server/services/schedulerService.js");
    expect(await cancelSchedule("sch_does_not_exist_at_all")).toBe(false);
  });
});

describe("جدولة — عزل الملكية (تسريب جدولات الآخرين)", () => {
  it("مهمة مملوكة لا تظهر للضيف ولا يُلغيها", async () => {
    const { scheduleDownload, listSchedules, listSchedulesFor, cancelSchedule } =
      await import("../server/services/schedulerService.js");
    const owner = "user_owner_1";
    const rec = scheduleDownload({
      url: "https://example.com/owned",
      runAt: new Date(Date.now() + 864e5).toISOString(),
      userId: owner,
    });
    expect(rec.userId).toBe(owner);

    // الضيف (بدون توكن) لا يرى ولا يلغي
    expect(listSchedulesFor("").some((r) => r.id === rec.id)).toBe(false);
    expect(await cancelSchedule(rec.id, "")).toBe(false);

    // مستخدم آخر لا يرى ولا يلغي
    expect(listSchedulesFor("someone_else").some((r) => r.id === rec.id)).toBe(false);
    expect(await cancelSchedule(rec.id, "someone_else")).toBe(false);

    // المالك يرى ويلغي
    expect(listSchedulesFor(owner).some((r) => r.id === rec.id)).toBe(true);
    expect(await cancelSchedule(rec.id, owner)).toBe(true);
  });

  it("مهمة بلا مالك تبقى متاحة للضيف (سلوك التحميل العام)", async () => {
    const { scheduleDownload, listSchedulesFor, cancelSchedule } =
      await import("../server/services/schedulerService.js");
    const rec = scheduleDownload({
      url: "https://example.com/guest",
      runAt: new Date(Date.now() + 864e5).toISOString(),
    });
    expect(listSchedulesFor("").some((r) => r.id === rec.id)).toBe(true);
    expect(await cancelSchedule(rec.id, "")).toBe(true);
  });
});

describe("سجل التحميلات — سجل المستخدم وحده", () => {
  it("getHistoryForUser لا يخلط بين مستخدمين", async () => {
    const { db } = await import("../server/services/db.js");
    await db.logHistory({ url: "https://example.com/a", title: "A", userId: "u1" });
    await db.logHistory({ url: "https://example.com/b", title: "B", userId: "u2" });
    const u1 = await db.getHistoryForUser("u1");
    const u2 = await db.getHistoryForUser("u2");
    expect(u1.every((h) => h.userId === "u1")).toBe(true);
    expect(u1.some((h) => h.url.includes("/b"))).toBe(false);
    expect(u2.some((h) => h.url.includes("/b"))).toBe(true);
    expect((await db.getHistoryForUser("ghost")).length).toBe(0);
    expect((await db.getHistoryForUser(null)).length).toBe(0);
  });
});
