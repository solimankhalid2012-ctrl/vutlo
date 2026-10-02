import { describe, it, expect, vi, beforeEach } from "vitest";
import { installErrorReporting } from "../src/utils/errorReporter.js";

/**
 * نستورد الوحدة مرّة واحدة: المستمعون يُركّبون على window المشترك،
 * وresetModules كان يخلق نسخة جديدة في كل اختبار، فيتراكم المستمعون.
 * التثبيت يحدث في أول اختبار، والحراسة `installed` تمنع التكرار بعدها.
 */
async function payloadOf(call) {
  const [, blob] = call;
  return JSON.parse(await blob.text());
}

describe("مُبلّغ أخطاء المتصفح", () => {
  let beaconSpy;

  beforeEach(() => {
    beaconSpy = vi.fn(() => true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: beaconSpy,
      configurable: true,
      writable: true,
    });
    globalThis.fetch = vi.fn(async () => ({}));
  });

  it("يرسل خطأ window إلى /api/client-error مع بيانات الملف", async () => {
    installErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", {
      message: "boom",
      filename: "src/hooks/useDownload.js",
      lineno: 32,
      colno: 45,
      error: new Error("boom"),
    }));

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    expect(beaconSpy.mock.calls[0][0]).toBe("/api/client-error");
    const p = await payloadOf(beaconSpy.mock.calls[0]);
    expect(p.kind).toBe("window-error");
    expect(p.message).toBe("boom");
    expect(p.data).toContain("useDownload.js");
    expect(p.data).toContain("32");
  });

  it("يرسل رفضاً غير ملتقط مع الـ stack (حالة JSON الفارغ)", async () => {
    installErrorReporting();

    const ev = new Event("unhandledrejection");
    ev.reason = new SyntaxError("Unexpected end of JSON input");
    window.dispatchEvent(ev);

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const p = await payloadOf(beaconSpy.mock.calls[0]);
    expect(p.kind).toBe("unhandledrejection");
    expect(p.message).toBe("Unexpected end of JSON input");
    expect(p.stack).toContain("SyntaxError");
  });

  it("يتعامل مع رفض غير Error (نص أو null) دون رمي", async () => {
    installErrorReporting();

    for (const reason of [undefined, null, "نص عادي", 0]) {
      const ev = new Event("unhandledrejection");
      ev.reason = reason;
      expect(() => window.dispatchEvent(ev)).not.toThrow();
    }
    expect(beaconSpy).toHaveBeenCalledTimes(4);
  });

  it("لا يركّب المستمعين مرتين", async () => {
    installErrorReporting();
    installErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { message: "مرة واحدة" }));
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  it("يستخدم fetch عند غياب sendBeacon ولا يرمي عند فشل الشبكة", async () => {
    installErrorReporting();
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); });

    expect(() =>
      window.dispatchEvent(new ErrorEvent("error", { message: "offline" })),
    ).not.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("يقتطع الرسائل الطويلة حتى لا يمتلئ السجل", async () => {
    installErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { message: "x".repeat(5000) }));
    const p = await payloadOf(beaconSpy.mock.calls[0]);
    expect(p.message.length).toBeLessThanOrEqual(800);
  });
});
