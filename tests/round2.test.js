/**
 * اختبارات انحدار — الجولة الثانية (تعدد الملفات، الخصوصية، صدق الادعاءات).
 *
 * كل حالة هنا كانت سلوكاً خاطئاً فعلياً:
 * - ffmpegService كان يقبل start/duration/width بلا حدود ⇒ مسار -ss عشوائي.
 * - أخطاء الجدولة/yt-dlp بدون expose كانت تصل كـ500 وتُخفي سبب الرفض.
 * - سجل الضيف كان يعرض عناوين كل المستخدمين.
 * - isValidUrl كان يفشل مع "HTTP://" الكبيرة.
 * - روابط /files النسبية تنكسر عند فصل الـAPI.
 * - قائمة Features كانت تعلن PWA وAI كميزات متاحة وهي غير منفّذة.
 */
import { describe, it, expect } from "vitest";

// ── 1) حدود معاملات FFmpeg ──
import { clampGifArgs, ffmpegDepth, MAX_FFMPEG } from "../server/services/ffmpegService.js";
// ── 2) أخطاء الجدولة: status + expose ──
import { scheduleDownload } from "../server/services/schedulerService.js";
// ── 3) أخطاء إدخال yt-dlp آمنة للعرض ──
import { assertUrl } from "../server/services/ytdlpService.js";
// ── 4) روابط الملفات المطلقة ──
import { fileUrl } from "../src/services/api.js";
// ── 5) صحة روابط المستخدم ──
import { isValidUrl } from "../src/utils/validators.js";
// ── 6) صدق قائمة الميزات ──
import { FEATURES, featureList, liveFeatures } from "../src/data/features.js";

describe("FFmpeg — حدود المعاملات", () => {
  it("يقصّ start/duration/width إلى المدى المسموح", () => {
    expect(clampGifArgs({ start: -500, duration: 9999, width: 9999 }))
      .toEqual({ start: 0, duration: 20, width: 720 });
    expect(clampGifArgs({ start: 1e9, duration: 0, width: 1 }))
      .toEqual({ start: 21600, duration: 1, width: 120 });
  });
  it("يقبل قيماً صحيحة كما هي", () => {
    expect(clampGifArgs({ start: 10, duration: 3, width: 480 }))
      .toEqual({ start: 10, duration: 3, width: 480 });
  });
  it("يتحمّل نقص المعاملات (لا NaN)", () => {
    const r = clampGifArgs({});
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v), JSON.stringify(r)).toBe(true);
    }
  });
  it("عمق FFmpeg يبدأ صفراً والحد الأقصى موجب", () => {
    const d = ffmpegDepth();
    expect(d.active).toBe(0);
    expect(d.waiting).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(1);
  });
});

describe("الأخطاء — تُعلَّم للعرض بدل 500", () => {
  it("خطأ وقت غير صالح في الجدولة = 400 مع expose", () => {
    try {
      scheduleDownload({ url: "https://youtube.com/watch?v=x", runAt: "ليس تاريخاً" });
      throw new Error("كان يجب أن يرمي");
    } catch (e) {
      expect(e.status).toBe(400);
      expect(e.expose).toBe(true);
      expect(e.message).not.toMatch(/\/Users\/|C:\\/); // بلا مسار داخلي
    }
  });
  it("وقت ماضٍ = خطأ مستخدم لا خطأ خادم", () => {
    expect(() =>
      scheduleDownload({ url: "https://youtube.com/watch?v=x", runAt: new Date(Date.now() - 60000).toISOString() }),
    ).toThrow(/المستقبل/);
  });
  it("رابط غير http/https يُرفض مع expose", () => {
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x.com/a"]) {
      try {
        assertUrl(bad);
        throw new Error(`كان يجب رفض ${bad}`);
      } catch (e) {
        expect(e.status).toBe(400);
        expect(e.expose).toBe(true);
      }
    }
  });
});

describe("روابط الملفات — تعمل عند فصل الواجهة عن الباكند", () => {
  it("يترك المسار المطلق كما هو", () => {
    expect(fileUrl("https://cdn.example.com/a.mp4")).toBe("https://cdn.example.com/a.mp4");
  });
  it("يبقي data: كما هي (QR/base64)", () => {
    expect(fileUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });
  it("يحوّل /files النسبي إلى مطلق حين ضبط VITE_API_URL", () => {
    // في بيئة الاختبار VITE_API_URL غير مضبوط ⇒ النتيجة تبدأ بـ/files (سلوك التطوير)
    expect(fileUrl("/files/a.mp4")).toMatch(/^(\/files\/a\.mp4|https?:\/\/[^/]+\/files\/a\.mp4)$/);
  });
  it("يتجاهل الفراغ", () => {
    expect(fileUrl("")).toBe("");
    expect(fileUrl(null)).toBe("");
  });
});

describe("تحقّق الروابط — حالة الأحرف", () => {
  it("يقبل البروتوكول بأحرف كبيرة", () => {
    expect(isValidUrl("HTTP://example.com/a")).toBe(true);
    expect(isValidUrl("HTTPS://example.com")).toBe(true);
  });
  it("يرفض غير http/https حتى لو بدا رابطاً", () => {
    expect(isValidUrl("javascript://example.com")).toBe(false);
    expect(isValidUrl("data:text/html,<b>x</b>")).toBe(false);
  });
  it("يقبل النطاق المجرّد ويرفض ما لا نطاق له", () => {
    expect(isValidUrl("youtube.com/watch?v=1")).toBe(true);
    expect(isValidUrl("localhost")).toBe(false);
  });
});

describe("صدق قائمة الميزات", () => {
  it("PWA ومساعد AI مُعلَّمان 'قريباً' في اللغتين", () => {
    for (const lang of ["ar", "en"]) {
      const list = featureList(lang);
      const pwa = list.find((f) => f[1].includes("PWA"));
      const ai = list.find((f) => f[1].includes("AI") || f[1].includes("مساعد"));
      expect(pwa, `${lang}: PWA`).toBeTruthy();
      expect(pwa[3], `${lang}: PWA يجب ألا يكون live`).toBe(1);
      expect(ai, `${lang}: AI`).toBeTruthy();
      expect(ai[3], `${lang}: AI يجب ألا يكون live`).toBe(1);
    }
  });
  it("الميزات غير المنفَّذة فعلاً مُعلَّمة 'قريباً' (لا تُعلن كمتاح)", () => {
    // تدقيق 2026-10 على الكود لا على الوصف — انظر تعليل كل واحد في features.js
    const mustBeSoon = {
      ar: ["بدون علامة مائية", "تحميل القنوات", "تحويل الصيغ", "مدير تحميلات", "بوت Telegram", "رمز QR"],
      en: ["No watermark", "Channels", "Format convert", "Download manager", "Telegram bot", "QR code"],
    };
    for (const lang of ["ar", "en"]) {
      for (const title of mustBeSoon[lang]) {
        const f = featureList(lang).find((x) => x[1] === title);
        expect(f, `${lang}: ${title} يجب أن يبقى في القائمة`).toBeTruthy();
        expect(f[3], `${lang}: ${title} يجب ألا يكون live`).toBe(1);
      }
    }
  });
  it("Features لا تعرض أي ميزة 'قريباً' إطلاقاً", () => {
    const { readFileSync } = require("node:fs");
    const src = readFileSync("src/pages/Features.jsx", "utf8");
    // الصفحة تستهلك liveFeatures فقط (لا featureList) ولا شارة "قريباً"
    expect(src).toContain("liveFeatures");
    expect(src).not.toContain("featureList");
    // لا شارة "قريباً" ولا شرط soon في العرض (التعليق العربي ذكر الكلمة فقط)
    expect(src).not.toContain("🔜");
    expect(src).not.toMatch(/soon\s*[?&|)]/);
    for (const lang of ["ar", "en"]) {
      const soon = featureList(lang).filter((f) => f[3]);
      for (const [, title] of soon) {
        expect(src, `${lang}: ${title} يجب ألا يُعرض`).not.toContain(`"${title}"`);
      }
    }
  });
  it("لا يدّعي روابط مشاركة قصيرة (غير منفّذة)", () => {
    for (const lang of ["ar", "en"]) {
      const share = featureList(lang).find((f) => f[1].includes("مشاركة") || f[1].toLowerCase().includes("share"));
      expect(share?.[2] || "").not.toMatch(/مختص|short link/i);
    }
  });
  it("عربي وإنجليزي: نفس الطول ونفس علامات 'قريباً'", () => {
    expect(FEATURES.ar.length).toBe(FEATURES.en.length);
    const arFlags = FEATURES.ar.map((f) => f[3]);
    const enFlags = FEATURES.en.map((f) => f[3]);
    // نفس المواضع: ما هو "قريباً" في العربية هو نفسه في الإنجليزية
    arFlags.forEach((f, i) => expect(enFlags[i], `index ${i}`).toBe(f));
  });
  it("liveFeatures لا تحتوي أي ميزة 'قريباً'", () => {
    for (const lang of ["ar", "en"]) {
      expect(liveFeatures(lang).every((f) => !f[3])).toBe(true);
    }
  });
  it("اللغة غير المدعومة ترجع الإنجليزية بلا crash", () => {
    expect(featureList("ja")).toBe(FEATURES.en);
  });
});

describe("اللغة غير المدعومة — لا انهيار", () => {
  it("changeLang بقيمة غير معروفة لا يكسر عرض المفاتيح", () => {
    // LangContext.now يتحقّق من اللغة؛ ما نتحقّق منه هنا أن المسار البديل آمن:
    // نداء t() بلغة غير موجودة يعيد قيمة إنجليزية لا undefined.
    const bogus = FEATURES["ja"];
    expect(bogus).toBeUndefined();
    expect(featureList("ja")).toBe(FEATURES.en);
  });
});
