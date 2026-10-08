/**
 * 🎞️ ميزة تحويل الفيديو إلى GIF — خيارات حقيقية تصل إلى الخادم
 *
 *Bug-being-guarded: كل خيارات GIF في الواجهة كانت تُتجاهل — الخادم يحوّل
 * بقيم ثابتة ({start:0, duration:4, width:480}) ومهما غيّر المستخدم.
 * الاختبارات هنا تحرس: (1) اللوحة تعرض كل الخيارات وتغيّرها فعّالة،
 * (2) الاختيارات تُرسل داخل طلب التنزيل، (3) الإعداد الجاهز بنقرة.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";

vi.mock("../src/services/api.js", () => ({
  fetchVideoInfo: vi.fn(async () => ({ title: "عنوان", duration: "10:00", durationSec: 600, thumbnail: "" })),
  startDownload: vi.fn(async () => ({ jobId: "job_gif_1", status: "downloading" })),
  getJob: vi.fn(async () => ({ jobId: "job_gif_1", status: "ready", progress: 0 })),
  cancelJob: vi.fn(async () => ({ ok: true })),
  convertJob: vi.fn(async () => ({ file: "a.mp3", fileUrl: "/files/a.mp3", size: 1 })),
  compressJob: vi.fn(async () => ({ file: "a.mp4", fileUrl: "/files/a.mp4", size: 1 })),
  gifJob: vi.fn(async () => ({ file: "a.gif", fileUrl: "/files/a.gif", size: 1 })),
  fileUrl: (p) => p,
  saveToDesktop: vi.fn(async () => ({ ok: true, path: "C:/Users/x/Desktop/a.gif" })),
}));

import LinkInput from "../src/components/downloader/LinkInput.jsx";
import GifOptions from "../src/components/downloader/GifOptions.jsx";
import { startDownload } from "../src/services/api.js";
import { GIF_DEFAULT, GIF_PRESETS, GIF_WIDTHS, GIF_FPS } from "../src/utils/tools.js";
import { LangProvider } from "../src/context/LangContext.jsx";
import { ThemeProvider } from "../src/context/ThemeContext.jsx";

let host = null;
let root = null;

const txt = (el) => el.textContent.replace(/\s+/g, " ").trim();
const btnByText = (t) => [...host.querySelectorAll("button")].find((b) => txt(b).includes(t));
// أزرار الخيارات الرقمية: مطابقة تماماً (وإلا طابق "320" البحث عن "20")
const btnExact = (t) => [...host.querySelectorAll("button")].find((b) => txt(b) === t);

describe("خيارات GIF 🎞️", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.clearAllMocks();
  });

  const mountOptions = (props = {}) => {
    const onChange = props.onChange || vi.fn();
    act(() => {
      root.render(
        <ThemeProvider>
          <LangProvider>
            <GifOptions {...props} onChange={onChange} />
          </LangProvider>
        </ThemeProvider>,
      );
    });
    return { onChange };
  };

  it("اللوحة تعرض كل الخيارات (start/duration/width/fps/dither/loop/speed)", () => {
    mountOptions();
    const selects = host.querySelectorAll("select");
    expect(host.querySelector('[data-testid="gif-options"]')).toBeTruthy();
    expect(selects.length, "قائمة السرعة + التدرّج + التكرار").toBe(3);
    // أزرار العرض والإطارات/ثانية بكل قيمها
    for (const w of GIF_WIDTHS) expect(btnExact(String(w)), `عرض ${w}`).toBeTruthy();
    for (const f of GIF_FPS) expect(btnExact(String(f)), `fps ${f}`).toBeTruthy();
    // حقول البداية والمدة رقمية
    const numbers = host.querySelectorAll('input[type="number"]');
    expect(numbers.length).toBe(2);
  });

  it("تغيير العرض/الإطارات/السرعة/التكرار/التدرّج يبلّغ عن قيمة جديدة", async () => {
    const { onChange } = mountOptions({ value: GIF_DEFAULT });

    await act(async () => { btnExact("320").click(); });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 320 }));

    await act(async () => { btnExact("20").click(); });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fps: 20 }));

    const selects = host.querySelectorAll("select");
    const setSelect = async (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      await act(async () => {
        setter.call(el, v);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await setSelect(selects[0], "2"); // السرعة
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 2 }));
    await setSelect(selects[1], "floyd_steinberg:2"); // التدرّج (اسم + مقياس Bayer)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ dither: "floyd_steinberg", bayerScale: 2 }));
    await setSelect(selects[2], "3"); // التكرار
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ loop: 3 }));
  });

  it("الإعداد الجاهز يملأ كل الخيارات بنقرة", async () => {
    const { onChange } = mountOptions({ value: GIF_DEFAULT });
    const square = GIF_PRESETS.find((p) => p.id === "square");
    await act(async () => { btnByText(square.ar).click(); });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining(square.opts));
  });

  it("يعرض عدد الإطارات والحجم التقديري من المدة×الإطارات", () => {
    mountOptions({ value: { ...GIF_DEFAULT, duration: 4, fps: 15 }, durationSec: 600 });
    const line = txt(host.querySelector('[data-testid="gif-options"] p'));
    expect(line).toContain("60 إطار"); // 4s × 15fps
    expect(line).toMatch(/≈\d+(\.\d+)? MB/);
  });

  it("البداية لا تتجاوز نهاية الفيديو", () => {
    // فيديو 10 ثوانٍ فقط ⇒ لا يُسمح ببداية 300 ثانية
    mountOptions({ value: { ...GIF_DEFAULT, start: 300, duration: 4 }, durationSec: 10 });
    const startInput = host.querySelectorAll('input[type="number"]')[0];
    expect(Number(startInput.max)).toBeLessThanOrEqual(10);
    expect(Number(startInput.value)).toBeLessThanOrEqual(10);
  });

  it("أداة GIF ترسل الخيارات مع طلب التنزيل (كانت تُتجاهل)", async () => {
    act(() => {
      root.render(
        <ThemeProvider>
          <LangProvider>
            <LinkInput />
          </LangProvider>
        </ThemeProvider>,
      );
    });
    // 1) اكتب رابطاً + حلّل
    const input = host.querySelector('input[type="text"], input[dir="ltr"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, "https://www.youtube.com/watch?v=abc12345678");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { btnByText("تحليل").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // 2) اختر أداة GIF (ضغطة واحدة)
    await act(async () => { btnByText("صورة GIF").click(); });
    expect(host.querySelector('[data-testid="gif-options"]'), "لوحة خيارات GIF ظاهرة").toBeTruthy();

    // 3) غيّر العرض والإطارات
    await act(async () => { btnExact("360").click(); });
    await act(async () => { btnExact("15").click(); });

    // 4) نزّل ⇒ يجب أن تحمل الطلب كل الخيارات
    await act(async () => { btnByText("تحميل الآن").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(startDownload).toHaveBeenCalledTimes(1);
    const arg = startDownload.mock.calls[0][1];
    expect(arg.format).toBe("gif");
    expect(arg.gif).toMatchObject({ width: 360, fps: 15, duration: GIF_DEFAULT.duration });
    expect(Object.keys(arg.gif).sort()).toEqual(["bayerScale", "dither", "duration", "fps", "loop", "speed", "start", "width"]);
  });
});
