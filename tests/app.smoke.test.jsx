/**
 * اختبار دخان لكل الصفحات: يركّب التطبيق فعلياً داخل jsdom ويتنقل بين المسارات
 * كما يفعل المتصفح، ويتأكد أن كل صفحة تُرسم محتوى وتتعامل مع ردود الـAPI بأمان
 * (حماية دائمة ضد خطأ "شاشة بيضاء").
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { act } from "react";

const ROUTES = [
  "/", "/ar", "/download", "/lab", "/history", "/features", "/about",
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
  if (u.includes("/api/history")) return json([]);
  return json({});
}

let unhandled = [];
let consoleErrors = [];

const onRejection = (reason) => unhandled.push(String(reason));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(ms = 120) {
  for (let i = 0; i < 12; i++) {
    await act(async () => {
      await wait(ms);
    });
  }
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom لا يوفّر IntersectionObserver — framer-motion يحتاجه لتحريك whileInView
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
  await act(async () => {
    await import("../src/main.jsx");
  });
  await settle(40);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
  consoleErrors = [];
  unhandled = [];
});

beforeEach(() => {
  consoleErrors = [];
  unhandled = [];
  // ⚠️ vite.config.js فيه restoreMocks: true، فيُعاد أي spy بعد أول
  // اختبار. لو ركّبنا الـ spy في beforeAll فقط لكانت كل تأكيدات
  // console أدناه تمرّ دون أن ترصد شيئاً. نعيد التركيب هنا في كل مرة.
  globalThis.fetch = async (url) => mockFetch(url);
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

describe("app bootstrap", () => {
  it("يركّب التطبيق داخل #root", () => {
    const root = document.getElementById("root");
    expect(root.children.length).toBeGreaterThan(0);
    expect(root.innerHTML.length).toBeGreaterThan(500);
  });

  it("يعرض شريط التنقل والأيقونات في الصفحة الرئيسية", () => {
    const html = document.getElementById("root").innerHTML;
    expect(html).toContain("<a");
    expect(html).toContain("<svg");
  });

  for (const route of ROUTES) {
    it(`يرسم المسار ${route} بدون أخطاء`, async () => {
      const root = await navigate(route);
      const html = root.innerHTML;
      expect(html.length, `المسار ${route} فارغ`).toBeGreaterThan(300);
      expect(root.textContent.trim().length, `المسار ${route} بلا نص`).toBeGreaterThan(10);
      expect(html).not.toMatch(/Cannot read propert|is not a function/);
      expect(unhandled).toEqual([]);
      const realErrors = consoleErrors.filter(
        (e) => !e.includes("not wrapped in act") && !e.includes("ReactDOMTestUtils"),
      );
      expect(realErrors).toEqual([]);
    });
  }
});
