// @vitest-environment node
/**
 * اختبارات سياسة أمان المحتوى (CSP).
 *
 * الخلل الذي أصلحناه: `helmet()` بلا تخصيص ⇒ CSP الافتراضي
 *   • script-src 'self' يحجب سكربت اللغة/الاتجاه inline ⇒ خطأ في الواجهة.
 *   • img-src 'self' data: يحجب كل مصغّرات يوتيوب/المنصات ⇒ صور مكسورة.
 *
 * الاختبار الحاسم هنا هو "البصمات تطابق HTML": لو عدّل أحدهم سكربتاً inline
 * في index.html ونسي تحديث الـsha256، يسقط هذا الاختبار ⇒ لا تُحجب الواجهة
 * في الإنتاج بعد صمت.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CSP_SCRIPT_HASHES, CSP_DIRECTIVES, inlineScriptHashes, sha256Base64,
} from "../server/config/csp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("CSP: السكربتات مقفلة ببصمة لا بـunsafe-inline", () => {
  it("لا يسمح بـ'unsafe-inline' في script-src", () => {
    expect(CSP_DIRECTIVES.scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("يمنع معالجات الأحداث inline في السمات", () => {
    expect(CSP_DIRECTIVES.scriptSrcAttr).toEqual(["'none'"]);
  });

  it("يسمح بـ'self' فقط خارج البصمات المدرجة", () => {
    const nonHash = CSP_DIRECTIVES.scriptSrc.filter((s) => !s.startsWith("'sha256-"));
    expect(nonHash).toEqual(["'self'"]);
  });

  it("يمنع<object> والـbaseURI والاتجاه الخبيث", () => {
    expect(CSP_DIRECTIVES.objectSrc).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES.baseUri).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES.formAction).toEqual(["'self'"]);
  });
});

describe("الصور:allowlist يسمح بمصغّرات المنصات", () => {
  it("يسمح بـhttps: وblob: وdata:", () => {
    for (const s of ["https:", "blob:", "data:", "'self'"]) {
      expect(CSP_DIRECTIVES.imgSrc, s).toContain(s);
    }
  });

  it("لا يسمح بـ'unsafe-inline' للصور", () => {
    expect(CSP_DIRECTIVES.imgSrc).not.toContain("'unsafe-inline'");
  });

  it("يسمح بالصوت/الفيديو من نفس المصادر (blob لمعاينة محلية)", () => {
    expect(CSP_DIRECTIVES.mediaSrc).toEqual(["'self'", "data:", "blob:", "https:"]);
  });
});

describe("بصمات السكربتات inline تطابق HTML الفعلي", () => {
  it("sha256Base64 يطابق base64(node:crypto) — مرجع مستقل", () => {
    expect(sha256Base64("abc")).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
  });

  it("index.html: كل سكربت inline مسموح ببصمته", () => {
    const hashes = inlineScriptHashes(read("index.html"));
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) {
      expect(CSP_SCRIPT_HASHES, `بصمة غير مسموحة في index.html: ${h}`).toContain(h);
    }
  });

  it("dist/index.html: نفس البصمات (المبني لا يختلف عن المصدر)", () => {
    const dist = path.join(ROOT, "dist", "index.html");
    if (!fs.existsSync(dist)) return; // البناء ليس مطلوباً لتشغيل الاختبارات
    expect(inlineScriptHashes(read("dist/index.html"))).toEqual(inlineScriptHashes(read("index.html")));
  });

  it("يوجد سكربت ضبط اللغة (سبب الحجب الأصلي)", () => {
    // إن حُذف السكربت فلا داعي لبصمته ⇒ يمنع بقاء بصمات ييتيمة
    const html = read("index.html");
    const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    let hasLang = false;
    while ((m = re.exec(html))) {
      if (m[1].includes("src=")) continue;
      if (/vv-lang|navigator\.language/.test(m[1])) hasLang = true;
    }
    expect(hasLang, "سكربتLanguage/الاتجاه غير موجود في index.html").toBe(true);
  });

  it("يكتشف أي سكربت inline جديد لا تغطيه البصمات", () => {
    // محاكاة تعديل قادم: لو أضاف أحدهم <script>alert(1)</script> فلن يُسمح به
    const evil = "<script>alert('xss')</script>";
    expect(CSP_SCRIPT_HASHES).not.toContain(...inlineScriptHashes(evil));
  });
});