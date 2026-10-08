/**
 * ⭐ بطاقة التقييم في الصفحة الرئيسية — RatingWidget
 *
 * الحراسة: الرقم المعروض يأتي من الخادم (GET /api/rating) لا من ثابت
 * مكتوب في JSX — والتقييم بالنقر يذهب فعلاً إلى الخادم (POST) بمعرّف
 * متصفح يقبله الخادم، ثم يُبنى العدّاد من ردّ الخادم. لو انقطع أحد
 * هذين الوصلين عاد الموقع لعرض رقم مزروع/صامت كما كان قبل.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";

import { LangProvider } from "../src/context/LangContext.jsx";

beforeAll(() => {
  // jsdom لا يوفّر IntersectionObserver — framer-motion يحتاجه لـwhileInView (Reveal)
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
});

const STATS = { count: 128, average: 4.6, by: { 1: 3, 2: 5, 3: 10, 4: 30, 5: 80 } };
const NEXT = { count: 129, average: 4.6, by: { 1: 3, 2: 5, 3: 10, 4: 31, 5: 80 } };

/** ردّ ناجح بصيغة fetch (نستخدم res.text() في ratingApi) */
const ok = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
/** ردّ فاشل */
const fail = (error, status = 500) => ({
  ok: false,
  status,
  text: async () => JSON.stringify({ error }),
});

let host = null;
let root = null;
let fetchMock = null;

/** تفريغ الميكرومهام + مؤقّتات كي يستقرّ الجلب والنشر في المتجر */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const mount = async () => {
  const { default: RatingWidget } = await import("../src/components/common/RatingWidget.jsx");
  await act(async () => {
    root.render(
      <LangProvider>
        <RatingWidget />
      </LangProvider>,
    );
  });
  await flush(); // يستثير تأثير الجلب (GET) ونشر النتيجة
};

const labels = () => [...host.querySelectorAll(".rating label")];
const clickStar = async (star) => {
  // ترتيب DOM من 5 إلى 1 (row-reverse) — النجمة n على الموضع 5-n
  const label = labels()[5 - star];
  await act(async () => { label.click(); });
  await flush();
};

const callsTo = (method) =>
  fetchMock.mock.calls.filter(([, opts]) => opts && opts.method === method);

describe("بطاقة التقييم ⭐", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window.navigator, "language", { value: "ar", configurable: true });
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    fetchMock = vi.fn(async () => ok(STATS));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
  });

  it("يجلب الإحصاءات من الخادم ويعرض العدّاد والمتوسط", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/rating$/);
    expect(fetchMock.mock.calls[0][1]).toBeUndefined(); // GET

    expect(host.textContent).toContain("128");
    expect(host.textContent).toContain("4.6");
    expect(host.querySelector('[data-testid="rating-count"]')).toBeTruthy();
  });

  it("النقر على نجمة يرسل POST بمعرّف صالح ثم يبني العدّاد من ردّ الخادم", async () => {
    fetchMock.mockImplementation(async (_url, opts) =>
      opts && opts.method === "POST" ? ok(NEXT) : ok(STATS),
    );
    await mount();

    await clickStar(4);

    const posts = callsTo("POST");
    expect(posts.length).toBe(1);
    const sent = JSON.parse(posts[0][1].body);
    expect(sent.stars).toBe(4);
    // نفس نمط الخادم: /^[\w:-]{8,64}$/ — وإلا رفض الـAPI تصويته
    expect(sent.clientId).toMatch(/^[\w:-]{8,64}$/);

    expect(host.textContent).toContain("129");
    expect(host.textContent).not.toContain("128");
  });

  it("فشل الحفظ يظهر رسالة خطأ ولا يُبلَّغ كأن التصويت نجح", async () => {
    fetchMock.mockImplementation(async (_url, opts) =>
      opts && opts.method === "POST" ? fail("تعذّر حفظ التقييم") : ok(STATS),
    );
    await mount();

    await clickStar(5);

    const alert = host.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("تعذّر حفظ التقييم");
  });
});
