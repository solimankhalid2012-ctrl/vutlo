/**
 * 🐒 بطاقة تسجيل الدخول (تصميم القرد) — البنية والسلوك
 *
 * الحراسة هنا twofold:
 * 1) ترتيب العناصر داخل .monkey-card لا يجوز تغييره أبداً: كل مؤثرات
 *    loginCard.css تعتمد على المحدِّدات الشقيقة (~) بهذا التسلسل:
 *    blind-check ▸ label.blind_input ▸ form ▸ label.avatar.
 * 2) منطق الدخول الحقيقي يبقى: type=password عند الإخفاء، التبديل
 *    بالنقر على القرد أو زر Show/Hide، النصوص ar/en، والإرسال للـAPI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

import Login from "../src/pages/Login.jsx";
import { LangProvider } from "../src/context/LangContext.jsx";
import { ThemeProvider } from "../src/context/ThemeContext.jsx";
import { MotionProvider } from "../src/components/common/Reveal.jsx";

const loginUser = vi.fn();
const saveSession = vi.fn();
vi.mock("../src/services/authApi.js", () => ({
  loginUser: (...a) => loginUser(...a),
  saveSession: (...a) => saveSession(...a),
  isLoggedIn: () => false,
  currentUser: () => null,
  logoutUser: () => {},
  me: async () => null,
  register: async () => ({}),
}));

let host = null;
let root = null;

describe("بطاقة تسجيل الدخول 🐒", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window.navigator, "language", { value: "ar", configurable: true });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    loginUser.mockReset();
    saveSession.mockReset();
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = () => act(() => {
    root.render(
      <HelmetProvider>
        <LangProvider>
          <ThemeProvider>
            <MotionProvider>
              <MemoryRouter><Login /></MemoryRouter>
            </MotionProvider>
          </ThemeProvider>
        </LangProvider>
      </HelmetProvider>,
    );
  });

  const kids = () => [...host.querySelector(".monkey-card").children];
  const $ = (s) => host.querySelector(s);

  it("يرتّب العناصر بالترتيب الذي تعتمد عليه CSS", () => {
    mount();
    const order = kids().map((n) => n.className.split(" ")[0] || n.tagName.toLowerCase());
    expect(order).toEqual(["blind-check", "blind_input", "form", "avatar"]);
  });

  it("زر Show/Hide ما زال يجلس على حقل كلمة المرور (لا عناصر تحرّكه)", () => {
    mount();
    // الزر ثابت bottom من البطاقة ⇒ آخر عنصر في .form يجب أن يبقى زر الإرسال
    const formKids = [...$(".form").children].map((n) => n.className.split(" ")[0]);
    expect(formKids[formKids.length - 1]).toBe("submit");
    expect($(".form .login-alt")).toBeNull();
    expect($(".monkey-card .login-error")).toBeNull();
    // رابط التسجيل موجود لكن تحت البطاقة
    expect($("main > div > .login-alt")).toBeTruthy();
  });

  it("يحتوي القرد بطبقتي SVG بالمعرّفات المطلوبة", () => {
    mount();
    const avatar = $(".avatar");
    expect(avatar.getAttribute("for")).toBe("blind-input");
    expect($("svg#monkey")).toBeTruthy();
    expect($("svg#monkey-hands")).toBeTruthy();
    expect($(".monkey-eye-r")).toBeTruthy();
    expect($(".monkey-eye-l")).toBeTruthy();
    //Hands فوق الوجه (ترتيب الطبقات في CSS)
    expect(kids().indexOf($(".avatar"))).toBeGreaterThan(kids().indexOf($(".form")));
  });

  it("يبدأ بكلمة مرور مخفية ويبدّلها بالنقر على القرد", () => {
    mount();
    const pwd = $("#password-input");
    expect(pwd.type).toBe("password");
    // unchecked ⇐ الحقل type=text و يظهر زر Hide
    act(() => $(".avatar").click());
    expect($("#blind-input").checked).toBe(false);
    expect($("#password-input").type).toBe("text");
    act(() => $(".avatar").click());
    expect($("#password-input").type).toBe("password");
  });

  it("زر Show/Hide مربوط بنفس الـcheckbox", () => {
    mount();
    const label = $("label.blind_input");
    expect(label.getAttribute("for")).toBe("blind-input");
    expect(label.textContent).toContain("إظهار");
    act(() => label.click());
    expect($("#blind-input").checked).toBe(false);
    expect($("#password-input").type).toBe("text");
  });

  it("العنوان والنصوص عربية افتراضياً", () => {
    mount();
    expect($(".form .title").textContent).toBe("تسجيل الدخول");
    expect($(".form .submit").textContent.trim()).toBe("تسجيل الدخول");
    expect($(".login-alt").textContent).toContain("أنشئ حساباً");
    expect($("label.blind_input").textContent).toContain("إظهار");
  });

  it("الإنجليزية تُستخدم بالكامل مع vv-lang=en", () => {
    window.localStorage.setItem("vv-lang", "en");
    mount();
    expect($(".form .title").textContent).toBe("Sign In");
    expect($(".form .submit").textContent.trim()).toBe("Submit");
    expect($(".login-alt").textContent).toContain("Create account");
    expect($(".frg_pss .forgot").textContent).toContain("Forgot password");
    expect($("label.blind_input").textContent).toContain("Show");
    window.localStorage.removeItem("vv-lang");
  });

  /** React يتجاهل value المعيّنة مباشرة ⇒ نستخدم الـsetter الأصلي */
  const type = (el, v) => act(() => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("يُرسل البريد وكلمة المرور للـAPI ويحفظ الجلسة", async () => {
    mount();
    loginUser.mockResolvedValue({ token: "t1", user: { id: 1 } });
    type($("#email-input"), "  a@b.com  ");
    type($("#password-input"), "secret123");
    await act(async () => { $(".form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(loginUser).toHaveBeenCalledWith("a@b.com", "secret123", expect.anything());
    expect(saveSession).toHaveBeenCalledWith("t1", { id: 1 });
  });

  it("يعرض خطأ الدخول داخل البطاقة ولا يرسل شيئاً", async () => {
    mount();
    loginUser.mockRejectedValue(new Error("bad creds"));
    await act(async () => { $(".form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect($(".login-error").textContent).toContain("bad creds");
  });

  it("CSS موجود بالألوان الأخضر/الأسود ومقيّد بـ.monkey-card", () => {
    // نتجاهل التعليقات (تحكي التصميم الأصلي) ونفحص القواعد فقط
    const css = readFileSync("src/styles/loginCard.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // كل قاعدة داخل النطاق (لا .card عام)
    expect(css).toContain(".monkey-card {");
    expect(css).not.toMatch(/^\s*\.card\s*{/m);
    expect(css).not.toMatch(/^\s*\.form\s*{/m);
    expect(css).not.toMatch(/^\s*\.input\s*{/m);
    // غير أبيض: خلفية داكنة + emerald
    expect(css).toContain("#0a0e0a");
    expect(css).toContain("#1db954");
    expect(css).not.toContain("background: white");
    // المؤثرات الأصلية موجودة
    for (const k of ["monkeyBlink", "monkeySlick", "-webkit-text-security", "blind_input", "monkey-eye-r", "perspective"]) {
      expect(css, k).toContain(k);
    }
  });
});
