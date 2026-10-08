/**
 * 🧪 المختبر (Lab) + قائمة اللغات + رابط الموقع
 *
 * ثلاث مجموعات:
 *  1) uploadApi.js — ترويسة الاسم المشفّر، التوكن، التقدّم، ونقل خطأ الخادم
 *     مع تقرير المسح إلى الواجهة (كان الخطأ نصاً فقط ⇒ المستخدم رأى "رُفض"
 *     بلا سبب).
 *  2) الماسح داخل المتصفح — ملف ELF اسمه .png يجب أن يُكشف بالنصب لا بالاسم.
 *  3) قائمة اللغات — كانت <select>: لا تُغلق بـEscape ولا بالنقر خارجها.
 *  4) رابط الموقع — يظهر فقط إن ضُبط VITE_SITE_URL (لا نخمّن عنواناً).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { act } from "react";
import { uploadFile, gifFromUpload, uploadMeta, absoluteUrl, UPLOAD_LIMITS } from "../src/services/uploadApi.js";

const json = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** تسوية React + framer-motion. رخيصة عمداً (0.36s): settle الطويل
 *  يتجاوز مهلة الاختبار ويترك مؤقّتات معلّقة تسرّب إلى الاختبار التالي. */
async function settle(ms = 60, times = 6) {
  for (let i = 0; i < times; i++) await act(async () => { await wait(ms); });
}

/* عينات حقيقية: توقيع PNG + كتلة ELF (ملف تنفيذي باسم صورة) */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(600).fill(0x41)]);
const ELF = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, ...Array(300).fill(0x00)]);

/* ── 1) uploadApi: طبقة XHR ─────────────────────────────────────────── */
class FakeXHR {
  constructor() { this.upload = {}; this.headers = {}; this.status = 0; this.responseText = ""; FakeXHR.last = this; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  send(body) { this.body = body; }
  respond(status, payload) {
    this.status = status;
    this.responseText = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onload?.();
  }
}

describe("uploadApi — الرفع بالـXHR", () => {
  beforeEach(() => {
    FakeXHR.last = null;
    globalThis.XMLHttpRequest = FakeXHR;
    localStorage.removeItem("vv-token");
  });

  it("يضع الاسم في ترويسة مشفّرة لا في query", async () => {
    const p = uploadFile(new File([PNG], "صورة العيد.png", { type: "image/png" }), {});
    const x = FakeXHR.last;
    x.respond(200, { id: "abc", url: "/u/abc", mode: "inline", mime: "image/png" });
    await p;
    expect(x.method).toBe("POST");
    expect(x.url).toContain("/api/upload");
    expect(x.url).not.toContain("?");
    // ⚠️ لو ذهب الاسم إلى query لأمكن تلاعب السجل وتكسر الترويسات
    expect(x.headers["X-File-Name"]).toBe(encodeURIComponent("صورة العيد.png"));
    expect(x.headers["X-File-Name"]).toMatch(/%/);
    expect(decodeURIComponent(x.headers["X-File-Name"])).toBe("صورة العيد.png");
  });

  it("يرسل التوكن موجوداً ويغيب بلا توكن", async () => {
    const p1 = uploadFile(new Blob(["a"]), {});
    FakeXHR.last.respond(200, { id: "a", url: "/u/a" });
    await p1;
    expect(FakeXHR.last.headers.Authorization).toBeUndefined();

    localStorage.setItem("vv-token", "TOK_9");
    const p2 = uploadFile(new Blob(["a"]), {});
    expect(FakeXHR.last.headers.Authorization).toBe("Bearer TOK_9");
    FakeXHR.last.respond(200, { id: "b", url: "/u/b" });
    await p2;
  });

  it("يبلّغ عن التقدّم (fetch لا يفعل)", async () => {
    const seen = [];
    const p = uploadFile(new Blob(["a"]), { onProgress: (v) => seen.push(v) });
    FakeXHR.last.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    FakeXHR.last.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    FakeXHR.last.respond(200, { id: "c", url: "/u/c" });
    await p;
    expect(seen).toEqual([0.5, 1]);
  });

  it("ينقل خطأ الخادم مع status وتقرير المسح (لا نصاً فقط)", async () => {
    const p = uploadFile(new Blob(["a"]), {});
    FakeXHR.last.respond(415, {
      error: "صيغة خطرة",
      scan: { verdict: "danger", score: 10, reasons: [{ id: "x", weight: -40, ar: "!", en: "!" }] },
    });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(415);
    expect(err.message).toBe("صيغة خطرة");
    expect(err.scan?.verdict).toBe("danger");
  });

  it("ردّ غير JSON لا يرمي SyntaxError على الواجهة", async () => {
    const p = uploadFile(new Blob(["a"]), { lang: "en" });
    FakeXHR.last.respond(502, "<html>502</html>");
    const err = await p.catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toBe("Upload failed");
  });

  it("gifFromUpload يجدول التحويل على /api/gif-local مع الخيارات", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => { seen.push({ url, opts }); return json({ id: "g1", url: "/u/g1", size: 10 }); };
    const out = await gifFromUpload("v1", { width: 320, dither: "bayer", bayerScale: 3 }, "ar");
    expect(seen[0].url).toContain("/api/gif-local");
    expect(seen[0].opts.method).toBe("POST");
    expect(JSON.parse(seen[0].opts.body)).toEqual({ id: "v1", gif: { width: 320, dither: "bayer", bayerScale: 3 } });
    expect(out.url).toBe("/u/g1");
  });

  it("uploadMeta يمرّر التوكن وabsoluteUrl يبني رابطاً كاملاً", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => { seen.push({ url, opts }); return json({ id: "m", name: "x" }); };
    localStorage.setItem("vv-token", "TOK_M");
    await uploadMeta("m", "ar");
    expect(seen[0].opts.headers.Authorization).toBe("Bearer TOK_M");
    expect(absoluteUrl("/u/m")).toBe(`${window.location.origin}/u/m`);
    expect(absoluteUrl("https://cdn.example/u/m")).toBe("https://cdn.example/u/m");
  });

  it("السقوف متسقة مع الخادم (50/200MB)", () => {
    expect(UPLOAD_LIMITS.guest).toBe(50 * 1048576);
    expect(UPLOAD_LIMITS.user).toBe(200 * 1048576);
  });
});

/* ── 2+3+4) التطبيق داخل jsdom ─────────────────────────────────────── */
let unhandled = [];
const onRejection = (r) => unhandled.push(String(r));

describe("صفحة /lab وقائمة اللغات", () => {
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
    // نضبط رابط الموقع قبل تحميل التطبيق (Footer يقرأ المتغيّر عند أول استيراد)
    vi.stubEnv("VITE_SITE_URL", "https://vutlo.example");
    process.on("unhandledRejection", onRejection);
    document.body.innerHTML = '<div id="root"></div>';
    window.history.pushState({}, "", "/ar");
    localStorage.setItem("vv-lang", "ar");
    await act(async () => { await import("../src/main.jsx"); });
    await settle(60, 10);
  });

  afterAll(() => {
    process.off("unhandledRejection", onRejection);
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    unhandled = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/auth/me")) return json({ error: "غير مصرح" }, false, 401);
      return json({});
    };
  });

  async function navigate(route) {
    await act(async () => {
      window.history.pushState({}, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await settle();
    return document.getElementById("root");
  }

  /** انتظار عنصر يظهر بعد تحميل كسول (لا نثبّت وقتاً —Tests全égaux تعمل بنفس
   *  السرعة؛ التثبيت يجعل الفشل مظهره مهلة لا خطأ حقيقي) */
  async function waitFor(sel, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
      const el = document.querySelector(sel);
      if (el) return el;
      if (Date.now() - t0 > ms) return null;
      await settle(50, 1);
    }
  }

  /** انتظار زوال عنصر (Escape/النقر خارجها يُغلقان بعد حركة framer) */
  async function waitGone(sel, ms = 4000) {
    const t0 = Date.now();
    for (;;) {
      if (!document.querySelector(sel)) return true;
      if (Date.now() - t0 > ms) return false;
      await settle(50, 1);
    }
  }

  /** حقن ملف في input[type=file] (files للقراءة فقط في jsdom) */
  async function pickFile(testid, file) {
    const input = await waitFor(`[data-testid="${testid}"]`);
    expect(input, `لا يوجد ${testid}`).toBeTruthy();
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle();
  }

  /** فتح تبويب في المختبر (بعد تحميل الصفحة) */
  async function openTab(name) {
    const tab = await waitFor(`[data-testid="lab-tab-${name}"]`);
    expect(tab, `لا يوجد تبويب ${name}`).toBeTruthy();
    await act(async () => { tab.click(); });
    await settle();
  }

  it("تُرسم بثلاث تبويبات ونص عربي", async () => {
    await navigate("/lab");
    const q = (s) => waitFor(s);
    expect(await q('[data-testid="lab-tab-scan"]')).toBeTruthy();
    expect(await q('[data-testid="lab-tab-upload"]')).toBeTruthy();
    expect(await q('[data-testid="lab-tab-gif"]')).toBeTruthy();
    expect(await q('[data-testid="scan-drop"]')).toBeTruthy();
    expect(document.documentElement.lang).toBe("ar");
  });

  it("الماسح: ELF اسمه .png يُكشف بالنصب لا بالامتداد", async () => {
    await navigate("/lab");
    await pickFile("scan-input", new File([ELF], "photo.png", { type: "image/png" }));
    const rep = document.querySelector('[data-testid="scan-report"]');
    expect(rep, "لم يظهر تقرير").toBeTruthy();
    expect(rep.dataset.verdict).toBe("danger");
    // الاسم يقول png، لكن التوقيع السحري يقول ملف تنفيذي لينكس
    expect(rep.textContent).toContain("ملف تنفيذي لينكس");
    expect(rep.textContent).toContain(".png");
  });

  it("الماسح: PNG سليم ⇒ verdict آمن", async () => {
    await navigate("/lab");
    await pickFile("scan-input", new File([PNG], "صورة العيد.png", { type: "image/png" }));
    const rep = document.querySelector('[data-testid="scan-report"]');
    expect(rep.dataset.verdict).toBe("safe");
    expect(rep.textContent).toContain("صورة PNG"); // التوقيع السحري، لا الاسم
  });

  it("تبويب الرفع يعرض السقف للزائر (50MB) لا للحساب", async () => {
    await navigate("/lab");
    await openTab("upload");
    const body = document.getElementById("root").textContent;
    expect(body).toContain("50MB");
    expect(document.querySelector('[data-testid="upload-drop"]')).toBeTruthy();
    expect(body).toContain("رابط دائم");
  });

  it("الرفع يبني رابطاً دائماً ويمتد إلى HTML/Markdown", async () => {
    globalThis.XMLHttpRequest = FakeXHR;
    await navigate("/lab");
    await openTab("upload");

    const input = await waitFor('[data-testid="upload-input"]');
    await act(async () => {
      Object.defineProperty(input, "files", {
        value: [new File([PNG], "صورة.png", { type: "image/png" })], configurable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(FakeXHR.last, "لم يُرسل XHR").toBeTruthy();

    await act(async () => {
      FakeXHR.last.respond(200, {
        id: "IMG123", url: "/u/IMG123", name: "صورة.png", size: 610,
        mime: "image/png", mode: "inline",
      });
    });
    await settle();

    const code = document.querySelector('[data-testid="upload-url"]')?.textContent || "";
    expect(code).toContain("/u/IMG123");
    expect(document.querySelector('[data-testid="upload-result"]').textContent).toContain("Markdown");
    expect(unhandled).toEqual([]);
  });

  it("GIF: يرفض غير الفيديو قبل أي طلب", async () => {
    await navigate("/lab");
    await openTab("gif");
    await pickFile("gif-input", new File([PNG], "صورة.png", { type: "image/png" }));
    expect(document.querySelector('[data-testid="gif-error"]')?.textContent).toContain("اختر ملف فيديو");
    expect(document.querySelector('[data-testid="gif-convert"]')).toBeFalsy();
  });

  it("قائمة اللغات: تفتح بـ10 لغات، وتغلق بـEscape وبالنقر خارجها", async () => {
    await navigate("/lab");
    const btn = () => document.querySelector('[data-testid="lang-menu-btn"]');
    expect(btn().getAttribute("aria-expanded")).toBe("false");

    await act(async () => { btn().click(); });
    const pop = await waitFor('[data-testid="lang-menu-pop"]');
    expect(pop, "القائمة لم تفتح").toBeTruthy();
    expect(pop.querySelectorAll('[role="option"]').length).toBe(10);
    expect(btn().getAttribute("aria-expanded")).toBe("true");

    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(await waitGone('[data-testid="lang-menu-pop"]'), "Escape لم يغلق القائمة").toBe(true);

    await act(async () => { btn().click(); });
    expect(await waitFor('[data-testid="lang-menu-pop"]'), "القائمة لم تفتح مجدداً").toBeTruthy();
    // نقرة خارج القائمة (في الصفحة لا داخل الترويسة) ⇒ تُغلق
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(await waitGone('[data-testid="lang-menu-pop"]'), "النقر خارجها لم يغلق القائمة").toBe(true);
  });

  it("اختيار لغة يغيّر الاتجاه ويغلق القائمة", async () => {
    await navigate("/lab");
    const btn = () => document.querySelector('[data-testid="lang-menu-btn"]');
    await act(async () => { btn().click(); });
    expect(await waitFor('[data-testid="lang-ar"]'), "القائمة لم تُفتح").toBeTruthy();
    const arOpt = document.querySelector('[data-testid="lang-ar"]');
    expect(arOpt.getAttribute("aria-selected"), "ar هي اللغة الحالية").toBe("true");
    expect(document.querySelector('[data-testid="lang-en"]').getAttribute("aria-selected")).toBe("false");
    await act(async () => { document.querySelector('[data-testid="lang-he"]').click(); });
    await settle(20);
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(localStorage.getItem("vv-lang")).toBe("he");
    expect(document.querySelector('[data-testid="lang-menu-pop"]')).toBeFalsy();
    // نعيد العربية لبقية الاختبارات
    await act(async () => { btn().click(); });
    expect(await waitFor('[data-testid="lang-ar"]')).toBeTruthy();
    await act(async () => { document.querySelector('[data-testid="lang-ar"]').click(); });
    await settle(20);
    expect(document.documentElement.lang).toBe("ar");
  });

  it("لا اختيار بـ<select> في الترويسة (.ForeignLook)", async () => {
    await navigate("/lab");
    expect(await waitFor('[data-testid="lang-menu-btn"]')).toBeTruthy();
    expect(document.querySelector("header select")).toBeFalsy();
  });

  it("رابط الموقع يظهر في الفوتر وفي صفحة About", async () => {
    await navigate("/lab");
    const link = await waitFor('[data-testid="footer-site"]');
    expect(link, "لم يظهر رابط الموقع").toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://vutlo.example");
    expect(link.getAttribute("rel")).toContain("noopener");

    await navigate("/about");
    const about = await waitFor('[data-testid="about-site"]'); // تحميل كسول
    expect(about?.getAttribute("href")).toBe("https://vutlo.example");
  });

  it("أيقونة الموقع في الترويسة تفتح تبويباً جديداً بلا تسريب window.opener", async () => {
    await navigate("/lab");
    const head = await waitFor('[data-testid="header-site"]');
    expect(head, "أيقونة الموقع غير موجودة في الترويسة").toBeTruthy();
    expect(head.closest("header"), "الأيقونة يجب أن تكون داخل <header>").toBeTruthy();
    expect(head.getAttribute("href")).toBe("https://vutlo.example");
    expect(head.getAttribute("target")).toBe("_blank");
    // ⚠️ بلا noopener تفتح الصفحة الجديدة مرجعاً لـwindow.opener ⇒ تقدر توجّه
    // تبويبنا لموقع تصيّد عبر window.opener.location
    expect(head.getAttribute("rel")).toContain("noopener");
    expect(head.getAttribute("rel")).toContain("noreferrer");
    // أيقونة فقط: لا نص ظاهر (لا تكرار للعبارة مع الفوتر)
    expect(head.textContent.trim()).toBe("");
    expect(head.querySelector("svg")).toBeTruthy();
    expect(head.getAttribute("aria-label")).toBeTruthy();
  });
});
