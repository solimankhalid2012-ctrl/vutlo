/**
 * اختبارات انحدار أمنية — كل حالة هنا كانت ثغرة حقيقية قابلة للاستغلال:
 * - JWT كان يُوقَّع بـ secret افتراضي معروف ⇒ تزوير توكن أي مستخدم.
 * - كلمة السر كانت SHA-256 بلا ملح + مقارنة !== ⇒ تخمين فوري.
 * - /api/history و/job/:id و/schedules كانت تُكشف بيانات أي مستخدم.
 * - webhooks التليجرام/واتساب كانت مفتوحة لأي حدّ.
 * - /api/client-error و/contact بلا حدود ⇒ تلويث سجل + DoS.
 */
import { describe, it, expect, beforeAll } from "vitest";

// ── 1) سياسة كلمة السر + المقارنة بزمن ثابت ──
import {
  hashPassword, verifyPassword, hashPasswordLegacy,
  validatePassword, validateEmail, safeEqual,
} from "../server/config/passwords.js";
// ── 2) رفض الأسرار الضعيفة/المعروفة ──
import { isWeakSecret, FORBIDDEN_SECRETS, generateSecret } from "../server/config/security.js";
// ── 3) تحقّق webhooks ──
import { telegramWebhookOk, whatsappWebhookOk } from "../server/config/webhooks.js";
// ── 4) مفاتيح عدّاد محاولات الدخول ──
import { ipKey, emailKey, loginKey } from "../server/config/rateKeys.js";

describe("الأسرار — رفض القيم الضعيفة", () => {
  it("يرفض الافتراضيات المعروفة", () => {
    for (const s of FORBIDDEN_SECRETS) expect(isWeakSecret(s), s).toBe(true);
  });
  it("يرفض السر القديم change-me-super-secret", () => {
    expect(isWeakSecret("change-me-super-secret")).toBe(true);
    expect(isWeakSecret("change-me-super-secret".padEnd(40, "x"))).toBe(true); // بادئة معروفة
  });
  it("يرفض القصير والمتكرر والمتسلسل", () => {
    expect(isWeakSecret("")).toBe(true);
    expect(isWeakSecret(undefined)).toBe(true);
    expect(isWeakSecret("a".repeat(64))).toBe(true);
    expect(isWeakSecret("0123456789abcdef0123456789abcdef")).toBe(true);
  });
  it("يقبل سراً عشوائياً قوياً", () => {
    const s = generateSecret(32);
    expect(s).toHaveLength(64);
    expect(isWeakSecret(s)).toBe(false);
  });
});

describe("كلمات السر — scrypt بملح لكل مستخدم", () => {
  it("لا يخزّن الكلمة الصريحة", () => {
    const h = hashPassword("MyS3cret!Pass");
    expect(h).not.toContain("MyS3cret!Pass");
    expect(h.startsWith("scrypt$")).toBe(true);
  });
  it("ملح مختلف لكل مستخدم لنفس الكلمة ⇒ هاش مختلف", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a).ok).toBe(true);
    expect(verifyPassword("same-password", b).ok).toBe(true);
  });
  it("يرفض كلمة السر الخاطئة", () => {
    const h = hashPassword("correct-horse");
    expect(verifyPassword("wrong-horse", h).ok).toBe(false);
  });
  it("يرفض الهاش الفارغ/المشوّه بلا رمي", () => {
    expect(verifyPassword("x", "").ok).toBe(false);
    expect(verifyPassword("x", "scrypt$1$2$3").ok).toBe(false);
    expect(verifyPassword("x", "not-a-hash").ok).toBe(false);
  });
  it("يتعامل مع معاملات مخزّنة خبيثة (N ضخم = DoS) بلا استهلاك موارد", () => {
    const evil = `scrypt$1073741824$8$1$${Buffer.from("s").toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
    expect(verifyPassword("x", evil).ok).toBe(false);
  });
  it("يترقية تلقائية من SHA-256 القديم", () => {
    const legacy = hashPasswordLegacy("legacy-pass");
    const r = verifyPassword("legacy-pass", legacy);
    expect(r.ok).toBe(true);
    expect(r.needsUpgrade).toBe(true); // فيُعاد التجزئة بـ scrypt
    expect(verifyPassword("nope", legacy).needsUpgrade).toBe(false);
  });
});

describe("سياسة كلمة السر", () => {
  it("يرفض الأقصر من 8", () => {
    expect(validatePassword("abc").ok).toBe(false);
    expect(validatePassword("abcdefg").ok).toBe(false);
    expect(validatePassword("abcdefgh").ok).toBe(true);
  });
  it("يرفض الشائعة/المكررة/الأرقام", () => {
    for (const p of ["password", "admin123", "12345678", "letmein1", "aaaaaaaa", "20240101"]) {
      expect(validatePassword(p).ok, p).toBe(false);
    }
  });
  it("يرفض الطويل جداً", () => {
    expect(validatePassword("a".repeat(201)).ok).toBe(false);
  });
  it("يقبل كلمة قوية", () => {
    expect(validatePassword("Tr0ub4dor&3xyz").ok).toBe(true);
  });
});

describe("تحقّق البريد", () => {
  it("يقبل البريد الصحيح ويعيده موحّداً", () => {
    const r = validateEmail("  User@Example.COM ");
    expect(r.ok).toBe(true);
    expect(r.email).toBe("user@example.com");
  });
  it("يرفض الشاذ", () => {
    for (const e of ["", "no-at", "a@b", "a b@c.com", `${"a".repeat(250)}@b.com`]) {
      expect(validateEmail(e).ok, e).toBe(false);
    }
  });
});

describe("safeEqual — مقارنة بزمن ثابت", () => {
  it("يطابق المتساوي فقط", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false); // أطوال مختلفة بلا رمي
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("Webhooks — لا طلب بلا هوية", () => {
  it("تليجرام: يرفض بلا سر مطابق", () => {
    expect(telegramWebhookOk(undefined)).toBe(false);
    expect(telegramWebhookOk("wrong")).toBe(false);
  });
  it("واتساب: يرفضVerification خاطئ", () => {
    expect(whatsappWebhookOk({ "hub.verify_token": "guess" })).toBe(false);
    expect(whatsappWebhookOk({})).toBe(false);
  });
});

describe("عدّاد محاولات الدخول — لا يقفل الجيران", () => {
  const req = (ip, email) => ({ ip, body: { email } });

  it("نفس الـIP + بريدان مختلفان = مفتاحان (لا إقفال متبادل)", () => {
    // الثغرة: 5 محاولات فاشلة على حساب واحد كانت تُرجع 429 لكل من
    // يشترك في نفس الـIP (شبكة مكتب / CGNAT) — انظر loginKey.
    expect(loginKey(req("10.0.0.5", "a@x.com"))).not.toBe(loginKey(req("10.0.0.5", "b@x.com")));
  });
  it("نفس الحساب من IP مختلف = مفتاحان (distributed guessing يحتاج كذا)", () => {
    expect(loginKey(req("10.0.0.5", "a@x.com"))).not.toBe(loginKey(req("10.0.0.9", "a@x.com")));
  });
  it("لا يُتهرَب من الحدّ بتغيير حالة الأحرف أو المسافات", () => {
    const a = loginKey(req("10.0.0.5", "User@Example.com"));
    expect(a).toBe(loginKey(req("10.0.0.5", "  user@example.COM  ")));
  });
  it("يقصّ البريد العملاق (حجم المفتاح في الذاكرة)", () => {
    expect(emailKey(req("10.0.0.5", "a".repeat(500))).length).toBeLessThanOrEqual(120);
  });
  it("IPv6: /64 واحد = مفتاح واحد (عنوان واحد يمثّل آلاف الأجهزة)", () => {
    const a = ipKey({ ip: "2a01:4f8:c1b:aa10::1" });
    const b = ipKey({ ip: "2a01:4f8:c1b:aa10:ffff:ffff:ffff:fffe" });
    expect(a).toBe(b);
  });
  it("IPv6: صيغ نصية مختلفة لنفس العنوان ⇒ نفس المفتاح (إلاهار العدّاد)", () => {
    // ✂️ ثغرة: القصّ بالسلسلة كان يعطي "…:0:0" و"…:ffff:ffff:ffff:0:0"
    // لنفس العنوان ⇒ مهاجم يجدّاد العدّاد بمجرد كتابة العنوان بشكل آخر.
    const full = "2001:0db8:0000:0000:0000:0000:0000:0001";
    expect(ipKey({ ip: full })).toBe(ipKey({ ip: "2001:db8::1" }));
    expect(ipKey({ ip: full.toUpperCase() })).toBe(ipKey({ ip: full }));
    expect(ipKey({ ip: "::1" })).toBe(ipKey({ ip: "0:0:0:0:0:0:0:1" }));
  });
  it("IPv6-mapped: ::ffff:127.0.0.1 = 127.0.0.1 (عنوان واحد مفتاحان)", () => {
    expect(ipKey({ ip: "::ffff:127.0.0.1" })).toBe("127.0.0.1");
  });
  it("IPv6: /64 مختلف = مفتاح مختلف (لا ندمج شبكةً مع جارها)", () => {
    expect(ipKey({ ip: "2001:db8:1::1" })).not.toBe(ipKey({ ip: "2001:db8:2::1" }));
  });
  it("لا يرمي على عنوان مشوّه (مفتاح بديل لا انهيار)", () => {
    for (const bad of ["not-an-ip", "1.2.3", "999.1.1.1", "1::2::3", ""]) {
      expect(() => ipKey({ ip: bad }), bad).not.toThrow();
    }
  });
  it("IPv4: يُترك كاملاً (لا قصّ)", () => {
    expect(ipKey({ ip: "203.0.113.9" })).toBe("203.0.113.9");
  });
  it("req بلا ip لا يرمي (مفتاح بديل صالح)", () => {
    expect(ipKey({})).toBe("unknown-ip");
    expect(() => loginKey({})).not.toThrow();
  });
});
