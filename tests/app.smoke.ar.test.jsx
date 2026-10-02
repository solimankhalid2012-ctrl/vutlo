/**
 * نفس دخان النسخة الإنجليزية، لكن بالعربية.
 *
 * لماذا يوجد ملف منفصل: LangContext يقرأ اللغة من navigator.language،
 * وjsdom يبلّغ عن "en-US"، فكل الاختبارات السابقة كانت ترسم النسخة
 * الإنجليزية فقط. النتيجة: خطأ في النص العربي (مثل مفتاح React مكرر
 * في قائمة مزايا Pro) يمرّ دون أن يكتشفه أحد.
 *
 * هنا نثبّت vv-lang="ar" قبل تركيب التطبيق، ونشترط صفر تحذيرات React
 * في كل المسارات — بما فيها تحذير "same key".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { act } from "react";

const ROUTES = [
  "/", "/download", "/history", "/features", "/pricing", "/about",
  "/contact", "/privacy", "/terms", "/blog",
  "/login", "/register", "/admin/login", "/admin/users",
  "/admin/analytics", "/admin", "/blog/some-article-slug", "/no-such-page",
];

const json = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

function mockFetch(url = "") {
  const u = String(url);
  if (u.includes("/api/auth/me")) return json({ error: "غير مصرح" }, false, 401);
  if (u.includes("/api/posts")) return json({ slug: "some-article-slug", title: "مقال" });
  if (u.includes("/api/history")) {
    // رابطان متطابقان عمداً: السجل قد يحتوي نفس الفيديو أكثر من مرة،
    // ويجب ألا يطلق ذلك تحذير "same key".
    return json([
      { id: "h1", url: "https://youtu.be/dup", title: "أول", thumb: "", at: 2 },
      { id: "h2", url: "https://youtu.be/dup", title: "ثاني", thumb: "", at: 1 },
    ]);
  }
  return json({});
}

let unhandled = [];
let consoleErrors = [];
let consoleWarns = [];

const onRejection = (reason) => unhandled.push(String(reason));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(ms = 120) {
  for (let i = 0; i < 12; i++) {
    await act(async () => { await wait(ms); });
  }
}

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
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
  }
  process.on("unhandledRejection", onRejection);
  document.body.innerHTML = '<div id="root"></div>';
  window.history.pushState({}, "", "/");

  // 🔑 العربية قبل أي استيراد للتطبيق
  localStorage.setItem("vv-lang", "ar");

  await act(async () => { await import("../src/main.jsx"); });
  await settle(40);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
  consoleErrors = [];
  consoleWarns = [];
  unhandled = [];
});

beforeEach(() => {
  consoleErrors = [];
  consoleWarns = [];
  unhandled = [];
  // ⚠️ لا بد من إعادة التركيب في كل اختبار: إعداد vite.config.js فيه
  // restoreMocks: true، فيُعاد أي spy بعد أول اختبار، فتصبح كل
  // تأكيدات console أدناه فارغة/مضلّلة إن رُكّبت مرة واحدة في beforeAll.
  globalThis.fetch = async (url) => mockFetch(url);
  vi.spyOn(console, "error").mockImplementation((...a) => {
    consoleErrors.push(a.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...a) => {
    consoleWarns.push(a.map(String).join(" "));
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

/** تحذيرات React التي تعني خللاً برمجياً (وليست مجرد معلومة) */
const isReactProblem = (m) =>
  /^Warning:/.test(m) ||
  /same key|unique "key"|Each child in a list|validateDOMNesting|cannot appear as a descendant|is not a valid DOM element|Received NaN|Unsupported style property/i.test(m);

describe("النسخة العربية من كل الصفحات", () => {
  it("يركّب التطبيق بالعربية", () => {
    const root = document.getElementById("root");
    expect(root.innerHTML.length).toBeGreaterThan(500);
    // دليل على أن النسخة العربية هي المعروضة
    expect(root.innerHTML).toMatch(/[؀-ۿ]/);
  });

  for (const route of ROUTES) {
    it(`يرسم ${route} بالعربية بلا تحذيرات React`, async () => {
      const root = await navigate(route);
      const html = root.innerHTML;
      expect(html.length, `المسار ${route} فارغ`).toBeGreaterThan(300);
      expect(root.textContent.trim().length, `المسار ${route} بلا نص`).toBeGreaterThan(10);
      expect(html).not.toMatch(/Cannot read propert|is not a function/);
      expect(unhandled).toEqual([]);

      const problems = [...consoleErrors, ...consoleWarns].filter(
        (m) => isReactProblem(m) && !m.includes("not wrapped in act"),
      );
      expect(problems, `تحذيرات React في ${route}`).toEqual([]);
    });
  }

  it("يعرض رابطاً واحداً للتكرارات بلا تحذير مفتاح مكرر", async () => {
    const root = await navigate("/history");
    // السجل المُحاكى فيه نفس الرابط مرتين (h1/h2) — الصفحة تزيل التكرار
    expect(root.textContent).toContain("أول");
    expect(root.textContent).not.toContain("ثاني");
    const problems = [...consoleErrors, ...consoleWarns].filter(
      (m) => /same key|unique "key"/i.test(m),
    );
    expect(problems).toEqual([]);
  });
});
