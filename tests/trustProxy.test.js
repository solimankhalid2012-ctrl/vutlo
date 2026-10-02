/**
 * ثغرة: `app.set("trust proxy", 1)` كان مضبوطاً دائماً ⇒ تجاوز كل حدود الطلبات.
 *
 * كيف يعمل الانتهاك: nginx الافتراضي يستخدم proxy_add_x_forwarded_for، فيضيف
 * عنوان العميل *إلى* قيمة X-Forwarded-For التي يرسلها العميل. مع trust proxy=1
 * يقرأ Express أقرب مدخل للترويسة (أي ما أرسله المهاجم) فيحسبه req.ip، فيحصل
 * كل طلب على سجلّ حدٍّ نظيف ⇒ الحدّ عملياً بلا قيمة.
 */
import { describe, it, expect } from "vitest";
import { resolveTrustProxy } from "../server/config/trustProxy.js";

describe("trust proxy — لا يُفتح افتراضياً", () => {
  it("الافتراضي (غير مضبوط) = لا نثق بأي ترويسة", () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy("")).toBe(false);
    expect(resolveTrustProxy("   ")).toBe(false);
  });
  it("قيم غريبة/خطأ إملائي لا تُفعّل الثقة (fail-closed)", () => {
    for (const v of ["yes", "on", "enabled", "true-ish", "0.5", "-1", "null", "undefined"]) {
      expect(resolveTrustProxy(v), v).toBe(false);
    }
  });
  it("يقبل الرفع الصريح عند الحاجة", () => {
    expect(resolveTrustProxy("1")).toBe(1);
    expect(resolveTrustProxy("true")).toBe(1);
    expect(resolveTrustProxy("2")).toBe(2); // CDN + proxy
    expect(resolveTrustProxy("loopback")).toBe("loopback");
  });
  it("يتجاهل حالة الأحرف والمسافات", () => {
    expect(resolveTrustProxy("  TRUE ")).toBe(1);
    expect(resolveTrustProxy("LoopBack")).toBe("loopback");
  });
});