/**
 * 🔞 التسجيل مع العمر — الواجهة (Register.jsx)
 *
 * ما نثبته هنا:
 *  - الحقل موجود بحدود صحيحة وخطوة أعداد صحيحة؛
 *  - عمر خارج المدى ⇒ الزر معطّل ولا يخرج أي طلب؛
 *  - كسر (27.5) مرفوض بدل تقريبه إلى 28؛
 *  - عمر صحيح يُرسل كما هو تماماً (بلا تقريب ولا إزاحة وسائط).
 *
 * جانب الخادم مغطّى في tests/auth.age.test.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { act } from "react";

const PW = "vv-K9x2mQ7wLp";
const json = (data, ok = true, status = 200) => ({
  ok, status, json: async () => data, text: async () => JSON.stringify(data),
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 60, times = 6) {
  for (let i = 0; i < times; i++) await act(async () => { await wait(ms); });
}

let calls = [];
let unhandled = [];
const onRejection = (r) => unhandled.push(String(r));

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
  window.history.pushState({}, "", "/register");
  localStorage.setItem("vv-lang", "ar");
  localStorage.removeItem("vv-token");
  await act(async () => { await import("../src/main.jsx"); });
  await settle(60, 10);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
  localStorage.removeItem("vv-token");
  localStorage.removeItem("vv-user");
});

beforeEach(() => {
  calls = [];
  unhandled = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("/api/auth/me")) return json({ error: "غير مصرح" }, false, 401);
    if (u.includes("/api/auth/register")) {
      calls.push({ url: u, body: JSON.parse(opts?.body || "{}") });
      return json({ token: "T1", user: { id: "u1", email: calls[0].body.email, age: calls[0].body.age, points: 50 } });
    }
    return json({});
  };
});

const setValue = async (el, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(20, 2);
};

const submit = async () => {
  await act(async () => { document.querySelector("form").requestSubmit(); });
  await settle();
};

describe("نموذج التسجيل والعمر", () => {
  it("حقل العمر موجود بحدود صحيحة وخطوة أعداد صحيحة", async () => {
    const age = document.getElementById("age-reg");
    expect(age, "حقل العمر مفقود").toBeTruthy();
    expect(age.getAttribute("type")).toBe("number");
    expect(Number(age.getAttribute("min"))).toBe(13);
    expect(Number(age.getAttribute("max"))).toBe(120);
    expect(age.getAttribute("step")).toBe("1");
  });

  it("عمر خارج المدى يعطّل الزر ولا يرسل طلباً", async () => {
    await setValue(document.getElementById("email-reg"), "kid@test.invalid");
    await setValue(document.getElementById("age-reg"), "12");
    await setValue(document.getElementById("password-reg"), PW);

    const btn = document.querySelector("button.submit");
    expect(btn.disabled, "submit must stay disabled at age 12").toBe(true);
    expect(document.getElementById("age-reg").getAttribute("aria-invalid")).toBe("true");

    // نطلب الإرسال مباشرة (لا نقرة) ⇒ نتأكد أن النموذج لا يُرسل شيئاً أصلاً
    await submit();
    expect(calls).toEqual([]);
  });

  it("كسر مثل 27.5 يُرفض ولا يُقرَّب إلى 28", async () => {
    await setValue(document.getElementById("age-reg"), "27.5");
    expect(document.querySelector("button.submit").disabled).toBe(true);
    expect(document.getElementById("age-reg").getAttribute("aria-invalid")).toBe("true");
  });

  it("الملصق يوافق الخادم (8 أحرف لا 4)", () => {
    // الخادم: validatePassword يرفض أقل من 8 ⇒ "4+ أحرف" كان وعداً كاذباً.
    // نفحصه قبل الإرسال لأن النجاح ينقلنا للصفحة الرئيسية.
    expect(document.querySelector('label[for="password-reg"]').textContent).toMatch(/8\+/);
  });

  it("عمر صحيح يُرسل كما هو تماماً", async () => {
    await setValue(document.getElementById("age-reg"), "27");
    expect(document.querySelector("button.submit").disabled).toBe(false);
    await submit();
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/api/auth/register");
    expect(calls[0].body.age).toBe(27);
    expect(calls[0].body.email).toBe("kid@test.invalid");
    expect(unhandled).toEqual([]);
  });
});

