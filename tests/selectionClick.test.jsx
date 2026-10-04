/**
 * 🖱️ الاختيار بضغطة واحدة —LinkInput
 *
 * البلاغ: كان اختيار الجودة/الصيغة يحتاج ضغط الزر أكثر من مرة.
 * السبب: motion.button + whileHover/whileTap يحرّكان الزر أثناء الضغط (scale)،
 * فيقع mousedown وmouseup على عنصرين مختلفين ⇒ لا يُطلَق click.
 * الأكواد هنا: زر عادي بلا transform + aria-pressed + select-none/touch-manipulation.
 * الاختبار يحرس regressions: ضغطة واحدة = تحديد، وتبديل الصيغة والجودة يعمل.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";

// لا شبكة ولا FFmpeg: نعترض طبقة api بالكامل
vi.mock("../src/services/api.js", () => ({
  fetchVideoInfo: vi.fn(async () => ({ title: "عنوان تجريبي", duration: "00:30", thumbnail: "" })),
  startDownload: vi.fn(async () => ({ jobId: "job_test_1", status: "downloading" })),
  getJob: vi.fn(async () => ({ jobId: "job_test_1", status: "ready", progress: 0 })),
  cancelJob: vi.fn(async () => ({ ok: true })),
  convertJob: vi.fn(async () => ({ file: "x.mp3", fileUrl: "/files/x.mp3", size: 1 })),
  compressJob: vi.fn(async () => ({ file: "x.mp4", fileUrl: "/files/x.mp4", size: 1 })),
  gifJob: vi.fn(async () => ({ file: "x.gif", fileUrl: "/files/x.gif", size: 1 })),
  fileUrl: (p) => p,
  saveToDesktop: vi.fn(async () => ({ ok: true, path: "C:/Users/x/Desktop/x.mp4" })),
}));

import LinkInput from "../src/components/downloader/LinkInput.jsx";
import { LangProvider } from "../src/context/LangContext.jsx";
import { ThemeProvider } from "../src/context/ThemeContext.jsx";

let host = null;
let root = null;

/** يضبط الحقل ويضغط "تحليل" فينتظر اكتمال fetchInfo */
async function analyse() {
  const input = host.querySelector('input[type="text"], input[dir="ltr"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, "https://www.youtube.com/watch?v=abc12345678");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const btn = [...host.querySelectorAll("button")].find((b) => b.textContent.includes("تحليل"));
  await act(async () => { btn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const buttonByText = (text) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

const isSelected = (el) => el.getAttribute("aria-pressed") === "true";

describe("اختيار الجودة والصيغة بضغطة واحدة", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom افتراضياً en-US ⇒ نثبّت العربية لنبحث عن زر "تحليل"
    Object.defineProperty(window.navigator, "language", { value: "ar", configurable: true });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.localStorage.clear();
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = () => act(() => {
    root.render(
      <ThemeProvider>
        <LangProvider>
          <LinkInput />
        </LangProvider>
      </ThemeProvider>,
    );
  });

  it("ضغطة واحدة على جودة تُحدّدها فوراً", async () => {
    mount();
    await analyse();
    const target = buttonByText("720p");
    expect(target, "أزرار الجودة ظاهرة بعد التحليل").toBeTruthy();
    expect(isSelected(target)).toBe(false);
    await act(async () => { target.click(); });
    expect(isSelected(buttonByText("720p"))).toBe(true);
    expect(isSelected(buttonByText("1080p"))).toBe(false);
  });

  it("ضغطة واحدة على صيغة تُحدّدها، والقائمة تحوي mp3 مع mp4/webm/mkv", async () => {
    mount();
    await analyse();
    const formats = ["MP4", "MP3", "WEBM", "MKV"].map(buttonByText);
    expect(formats.every(Boolean), "الصيغ الأربع ظاهرة").toBe(true);
    await act(async () => { buttonByText("MKV").click(); });
    expect(isSelected(buttonByText("MKV"))).toBe(true);
    expect(isSelected(buttonByText("MP4"))).toBe(false);
  });

  it("MP3 متاح في أداة الفيديو ويخفي صف الجودة (صوت فقط)", async () => {
    mount();
    await analyse();
    await act(async () => { buttonByText("MP3").click(); });
    expect(isSelected(buttonByText("MP3"))).toBe(true);
    expect(buttonByText("720p"), "لا صف جودة مع MP3").toBeFalsy();
  });

  it("زر الاختيار بلا transform (motion) — سبب عدم التقاط النقرة الأولى", async () => {
    mount();
    await analyse();
    const target = buttonByText("360p");
    expect(target).toBeTruthy();
    expect(target.className).toContain("touch-manipulation");
    expect(target.className).not.toContain("transition-all");
  });

  /* ── ضغطة واحدة حتى لو ضاع حدث click ──────────────────────────────
     الآلية: كل transform أثناء الضغط (.btn active:scale / .card:hover /
     whileTap) يحرّك الزر تحت المؤشر ⇒ mousedown وmouseup على عنصرين
     مختلفين ⇒ لا click ⇒ المستخدم يضغط مرتين أو ثلاثاً.
     العلاج: الاختيار يتم عند pointerdown + لا transform أثناء الضغط. */
  it("الجودة تُختار عند الضغط (pointerdown) حتى بلا click", async () => {
    mount();
    await analyse();
    const target = buttonByText("1080p");
    await act(async () => {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(isSelected(buttonByText("1080p")), "pointerdown وحده يكفي").toBe(true);
  });

  it("الصيغة تُختار عند الضغط (pointerdown) حتى بلا click", async () => {
    mount();
    await analyse();
    await act(async () => {
      buttonByText("MKV").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(isSelected(buttonByText("MKV"))).toBe(true);
  });

  it("الأداة تُبدَّل عند الضغط (pointerdown) — بلا ضغطات متكررة", async () => {
    mount();
    await act(async () => {
      [...host.querySelectorAll('button[role="tab"]')]
        .find((b) => b.textContent.includes("صورة GIF"))
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    const gifTab = [...host.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.includes("صورة GIF"));
    expect(gifTab.getAttribute("aria-selected")).toBe("true");
  });

  it("لا transform أثناء الضغط في أي مكان (CSS مشترك)", () => {
    // نتجاهل التعليقات (تحكي المشكلة) ونفحص القواعد فقط
    const css = readFileSync("src/styles/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "active:scale يجعل الزر يهرب من المؤشر").not.toContain("active:scale");
    expect(css, "رفع البطاقة عند hover يحرّك أزرارها").not.toMatch(/\.card:hover[\s\S]{0,200}transform:/);
    // ولا في صفحات التطبيق: whileTap بمقياس
    expect(readFileSync("src/components/common/Reveal.jsx", "utf8")).not.toContain("whileTap: { scale: 0.");
  });
});