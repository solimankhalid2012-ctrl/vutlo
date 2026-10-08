// @vitest-environment node
/**
 * اختبارات حارس SSRF — server/config/ssrfGuard.js
 *
 * الهدف: yt-dlp لا يضرب أبداً loopback/الشبكة الداخلية/ميتاداتا السحابة،
 * حتى عبر التهريب: نطاقات داخلية، أسماء تنتقل إلى عناوين داخلية (nip.io)،
 * أرقام عشوائية غير قابلة للحل، وعناوين IPv4-mapped في IPv6.
 * القاعدة: fail-closed — أي رابط لا نستطيع إثبات أمانه يُرفض.
 */
import { describe, it, expect } from "vitest";
import {
  assertSafeHttpUrl,
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedHostname,
} from "../server/config/ssrfGuard.js";

const ok = async (url, ip = "93.184.216.34") =>
  assertSafeHttpUrl(url, async () => [{ address: ip }]);
const bad = async (url, ip) =>
  assertSafeHttpUrl(url, async () => [{ address: ip || "127.0.0.1" }]);

describe("isBlockedIPv4", () => {
  const blocked = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "169.254.1.5", "172.16.0.1", "172.31.255.254", "192.168.1.1",
    "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "255.255.255.255",
  ];
  for (const ip of blocked) {
    it(`يحجب ${ip}`, () => expect(isBlockedIPv4(ip)).toBe(true));
  }
  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "140.82.112.3", "151.101.1.69"];
  for (const ip of allowed) {
    it(`يسمح ${ip}`, () => expect(isBlockedIPv4(ip)).toBe(false));
  }
});

describe("isBlockedIPv6", () => {
  const blocked = ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::127.0.0.1"];
  for (const ip of blocked) {
    it(`يحجب ${ip}`, () => expect(isBlockedIPv6(ip)).toBe(true));
  }
  const allowed = ["2606:2800:220:1::a", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8"];
  for (const ip of allowed) {
    it(`يسمح ${ip}`, () => expect(isBlockedIPv6(ip)).toBe(false));
  }
});

describe("isBlockedHostname", () => {
  it("يحجب hostnames معنيّة/داخلية", () => {
    for (const h of ["localhost", "db.internal", "nas.local", "box.lan", "printer.localdomain", "ip6-localhost"]) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
  });
  it("يسمح أسماء AML عامة", () => {
    for (const h of ["youtube.com", "www.example.com", "cdn.vutlo.dev"]) {
      expect(isBlockedHostname(h), h).toBe(false);
    }
  });
});

describe("assertSafeHttpUrl — القبول والرفض", () => {
  it("يقبل http/https عام بلا DNS عند عنوان رقمي", async () => {
    await expect(ok("https://93.184.216.34/v")).resolves.toBe("https://93.184.216.34/v");
    await expect(ok("http://8.8.8.8/dns")).resolves.toBe("http://8.8.8.8/dns");
  });
  it("يقبل اسماً عاماً يتحلّل إلى عنوان عام", async () => {
    await expect(assertSafeHttpUrl("https://cdn.example/x", async () => [{ address: "93.184.216.34" }]))
      .resolves.toBe("https://cdn.example/x");
  });

  it("يرفض loopback والشبكة الداخلية نصياً وبالرقم", async () => {
    const list = [
      "http://localhost/", "http://127.0.0.1/", "http://[::1]/",
      "http://10.0.0.1/", "http://192.168.1.5/", "http://172.16.0.3/",
      "http://169.254.169.254/latest/meta-data/", "http://[fc00::1]/",
    ];
    for (const u of list) await expect(bad(u)).rejects.toThrow(/ممنوع|داخلي/);
  });

  it("يرفض اسماً يتحلّل إلى عنوان داخلي حتى لو بدا عاماً (nip.io)", async () => {
    await expect(bad("http://evil.nip.io/x")).rejects.toThrow(/داخلي|ممنوع/);
  });
  it("يرفض اسماً يشير إلى ميتاداتا السحابة", async () => {
    await expect(assertSafeHttpUrl("http://metadata.google.internal/", async () => [{ address: "169.254.169.254" }]))
      .rejects.toThrow(/داخلي|ممنوع/);
  });

  it("يرفض عنواناً رقمياً عشرِيّاً يُخفّي localhost (فشل تحقق = رفض)", async () => {
    await expect(assertSafeHttpUrl("http://2130706433/", async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    })).rejects.toThrow(/تعذّر التحقق|ممنوع/);
  });

  it("يرفض عند فشل DNS (fail-closed)", async () => {
    await expect(assertSafeHttpUrl("http://no-such-host.invalid/", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    })).rejects.toThrow(/تعذّر التحقق|ممنوع/);
  });

  it("يرفض IPv4-mapped لكل من الداخل والخارج عن IPv4 محجوب", async () => {
    await expect(bad("http://[::ffff:127.0.0.1]/")).rejects.toThrow(/ممنوع|داخلي/);
  });

  it("يرفض file:/javascript: ونطاقات داخلية نصية بلا أي DNS", async () => {
    const call = (u) => assertSafeHttpUrl(u, async () => {
      throw new Error("يجب ألا يصل الحلّ");
    });
    for (const u of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x.com/", "http://db.internal/"]) {
      await expect(call(u), u).rejects.toThrow();
    }
  });

  it("يحجب نطاقاً داخلياً حتى إن تحلّل ظاهرياً إلى عنوان عام", async () => {
    await expect(assertSafeHttpUrl("https://box.internal/x", async () => [{ address: "93.184.216.34" }]))
      .rejects.toThrow(/ممنوع/);
  });

  it("يرفض الرابط الفارغ والطويل جداً", async () => {
    await expect(assertSafeHttpUrl("")).rejects.toThrow("رابط مفقود");
    await expect(assertSafeHttpUrl("https://e.com/" + "a".repeat(2100))).rejects.toThrow("الحد 2048");
  });
});