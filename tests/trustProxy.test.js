/**
 * ثغرة: عنوان العميل في req.ip كان قابلاً للتزوير ⇒ تجاوز كل حدود الطلبات.
 *
 * الآلية (مؤكدة بقراءة مصدر proxy-addr وforwarded):
 *   forwarded() ⇒ addrs = [socket, ...XFF بالترتيب]
 *   alladdrs() يقصّ من اليسار عند أول قفزة غير موثوقة، ثم req.ip = العنصر الأخير.
 *   مع proxy يضيف عنوان العميل الحقيقي في الطرف الأيمن (proxy_add_x_forwarded_for
 *   أو استبدال الترويسة)، وترويسة المهاجم تقع على يسارها ⇒ إعداد Express الجاهز
 *   (1 أو loopback) يُعيد العنوان المزوَّر.
 *
 * الحل: نأخذ trustedHops عنصراً من اليمين فقط.
 */
import { describe, it, expect } from "vitest";
import { resolveTrustedHops, clientIpFromRequest } from "../server/config/trustProxy.js";

const req = (xff, socket = "127.0.0.1") => ({
  socket: { remoteAddress: socket },
  headers: xff ? { "x-forwarded-for": xff } : {},
});

describe("عدد القفزات الموثوقة", () => {
  it("الافتراضي 0 (لا نثق بأي ترويسة)", () => {
    for (const v of [undefined, "", "   ", "false", "no", "0"]) {
      expect(resolveTrustedHops(v), String(v)).toBe(0);
    }
  });
  it("قيم غير مفهومة تفشل مغلقة", () => {
    for (const v of ["maybe", "1.5", "-1", "on", "null"]) expect(resolveTrustedHops(v), v).toBe(0);
  });
  it("proxy واحد = 1، وعدة قفزات = الرقم", () => {
    expect(resolveTrustedHops("loopback")).toBe(1);
    expect(resolveTrustedHops("true")).toBe(1);
    expect(resolveTrustedHops("1")).toBe(1);
    expect(resolveTrustedHops("2")).toBe(2);
  });
  it("سقف معقول للأرقام الضخمة", () => {
    expect(resolveTrustedHops("99999")).toBe(10);
  });
});

describe("عنوان العميل لا يُؤخذ من العميل", () => {
  it("بلا proxy: عنوان الـsocket وحده، والترويسة تُتجاهل كلياً", () => {
    expect(clientIpFromRequest(req("9.9.9.9"), 0)).toBe("127.0.0.1");
  });

  it("قفزة واحدة + ترويسة مزوّرة: نأخذ الحقيقي من اليمين لا المزوَّر", () => {
    // nginx الافتراضي: "<ما أرسله العميل>, <الحقيقي>"
    expect(clientIpFromRequest(req("9.9.9.9, 203.0.113.7"), 1)).toBe("203.0.113.7");
  });

  it("nginx يستبدل الترويسة بدل إلحاقها: النتيجة صحيحة أيضاً", () => {
    expect(clientIpFromRequest(req("203.0.113.7"), 1)).toBe("203.0.113.7");
  });

  it("ترويسة مؤلَّفة بالكامل: تُتجاهل قيَمها، نأخذ الأيمن", () => {
    expect(clientIpFromRequest(req("1.1.1.1, 2.2.2.2, 3.3.3.3"), 1)).toBe("3.3.3.3");
  });

  it("قفزتان: نأخذ الثاني من اليمين", () => {
    expect(clientIpFromRequest(req("9.9.9.9, 8.8.8.8, 203.0.113.7"), 2)).toBe("8.8.8.8");
  });

  it("لا ترويسة إطلاقاً ⇒ عنوان الـsocket", () => {
    expect(clientIpFromRequest(req(undefined), 1)).toBe("127.0.0.1");
  });

  it("ترويسة أقصر من عدد القفزات ⇒ نأخذ الأيمن المتاح", () => {
    expect(clientIpFromRequest(req("203.0.113.7"), 2)).toBe("203.0.113.7");
  });

  it("قيَم فارغة/مسافات تُتجاهل", () => {
    expect(clientIpFromRequest(req(" , , 203.0.113.7 , "), 1)).toBe("203.0.113.7");
  });
});