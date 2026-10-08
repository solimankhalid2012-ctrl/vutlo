// ─────────────────────────────────────────────
// config/ssrfGuard.js — حارس SSRF (Server-Side Request Forgery)
//
// المشكلة: assertUrl كان يسمح بأي http/https شكلياً، فيضرب yt-dlp أي
// عنوان — بما فيه loopback/الشبكة الداخلية (127.0.0.1, 10.x, 172.16-31,
// 192.168, 169.254.169.254 ميتاداتا السحابة، ::1، fe80::…) ⇒ فحص خدمات
// داخلية عبر /download و /info و /playlist و /schedule.
//
// الحل (fail-closed):
//  1) http/https فقط (كما كان).
//  2) ممنوع: أسماء مضيفة معروفة (localhost…) ونطاقات داخلية (.local/.internal).
//  3) يُحلَّل الاسم عبر DNS (A + AAAA) الآن، وأي عنوان IP محجوب ⇒ رفض.
//     يمنع أيضاً التهريب: عناوين عددية عشرية/سداسية، nip.io، نطاقات تنتقل
//     إلى عناوين داخلية، وIPv4-mapped IPv6 (::ffff:127.0.0.1).
//  4) فشل DNS ⇒ رفض (لا نسمح بما لا نستطيع التحقق منه).
//  5) مخرج صريح لمن يحتاج روابط داخلية فعلاً: VUTLO_ALLOW_PRIVATE_URLS=1
//     (غير مضبوط افتراضياً ⇒ محجوب دائماً).
//
// ⚠️ متبقٍّ (معروف ومنشور): مهما كان الاسم المدخل آمن، قد يردّ الخادم
// المطلوب بـ302 نحو عنوان داخلي فيتبعه yt-dlp. سدّ هذا يتطلب عزل الشبكة
// (netns/firewall) — حارس الإدخال هو المعيار في مشاريع downloader.
// ─────────────────────────────────────────────
import dns from "node:dns/promises";

/** مخرج صريح للانظمة التي تحتاج فعلاً عناوين داخلية (self-hosted media …). */
const ALLOW_PRIVATE = /^(1|true|yes|on)$/i.test(String(process.env.VUTLO_ALLOW_PRIVATE_URLS || "").trim());

/** أسماء مضيفة معنيّة/داخلية — تُحجب نصياً قبل أي استفسار DNS. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain", "localhost6", "ip6-localhost", "ip6-loopback",
  "broadcasthost", "local", "0x7f000001",
]);

/** نطاقات تُستخدم حصرياً للشبكة الداخلية (RFC 6762/6761 + SOA) — لا مصدر عام. */
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".intranet", ".lan", ".home"];

/** خطأ برسالة عربية قابلة للعرض — يطابق نمط httpError في بقية الكود. */
export class SsrfError extends Error {
  constructor(message = "الرابط ممنوع لأسباب أمنية") {
    super(message);
    this.status = 400;
    this.expose = true; // الرسالة من لدينا => آمنة للعرض
  }
}

/* ── التحقق من العناوين ─────────────────────────────────────────── */

/** هل IPv4 محجوب؟ RFC1918, loopback, link-local، ميتاداتا 169.254.169.254،
 *  CGNAT 100.64/10، 0.0.0.0/8، documentation، multi/broadcast… */
export function isBlockedIPv4(ip) {
  const p = String(ip).split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b === 64) ||                                   // 100.64.0.0/10 CGNAT
    a === 127 ||
    (a === 169 && b === 254) ||                                  // link-local (تشمل الميتاداتا)
    (a === 172 && b >= 16 && b <= 31) ||                         // 172.16.0.0/12
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||            // 192.0.0.0/24 + 192.0.2.0/24
    (a === 192 && b === 168) ||                                  // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) ||                     // 198.18.0.0/15 التتبع
    (a === 198 && b === 51 && c === 100) ||                      // 198.51.100.0/24 doc
    (a === 203 && b === 0 && c === 113) ||                       // 203.0.113.0/24 doc
    a >= 224                                                     // multicast + reserved
  );
}

/** تحويل "a.b.c.d" المدموجة في نهاية IPv6 إلى قيمتها الممثّلة (لـ ::ffff:x). */
function mappedV4(ip) {
  const m = /(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(String(ip));
  if (!m) return null;
  const ok = m[1].split(".").every((n) => Number(n) >= 0 && Number(n) <= 255);
  return ok ? m[1] : null;
}

/** هل IPv6 محجوب؟ ::، ::1، ULA fc00::/7، link-local fe80::/10، multicast ff00::/8،
 *  documentation 2001:db8::، IPv4-mapped ::ffff:0:0/96، NAT64 64:ff9b::/96. */
export function isBlockedIPv6(ip) {
  const lower = String(ip).toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = mappedV4(lower) || String(lower.slice(7));
    return isBlockedIPv4(v4);
  }
  if (lower.startsWith("64:ff9b:")) {
    const v4 = mappedV4(lower);
    if (v4) return isBlockedIPv4(v4);
    return true; // NAT64 بلا IPv4 صريح ⇒ نتجنّب الاحتمال الداخلي
  }
  const first = parseInt(lower.split(":")[0], 16);
  if (!Number.isFinite(first)) return true;
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7
  if (first >= 0xff00) return true;                     // ff00::/8 multicast
  if (lower.startsWith("2001:db8")) return true;        // documentation
  if (lower.startsWith("0:") || lower.startsWith("0000:")) return true; // أصفار محجوزة
  return false;
}

const isIPv4Str = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
const isIPv6Str = (s) => String(s).includes(":");

/** عنوان IP مباشر (رقمي) قد يتجاوز فحص الاسم ⇒ يُفحص بحدّ ذاته. */
function isBlockedLiteral(host) {
  if (isIPv4Str(host)) return isBlockedIPv4(host);
  if (isIPv6Str(host)) return isBlockedIPv6(host);
  return null; // ليس عنواناً رقمياً
}

/** هل اسم المضيف محجوب نصياً؟ (لا يُحتاج حلّ DNS للتقرير) */
export function isBlockedHostname(host) {
  const low = String(host || "").trim().toLowerCase().replace(/\.$/, "");
  if (!low) return true;
  if (BLOCKED_HOSTNAMES.has(low)) return true;
  return BLOCKED_HOST_SUFFIXES.some((s) => low.endsWith(s));
}

/** افتراضي: حلّ كل العناوين (A + AAAA) عبر محلّل النظام. */
const lookupAll = (host) => dns.lookup(host, { all: true, verbatim: true });

/**
 * البوابة الواحدة لروابط yt-dlp: تحقّق الشكل + الحماية من SSRF.
 * @param {string} raw الرابط الخام من المستخدم
 * @param {(host: string) => Promise<{address: string}[]>} lookup حقّان قابل للحقن في الاختبارات
 * @returns {Promise<string>} الرابط كما هو إن أُجيز
 * @throws {SsrfError} عند أي مخالفة (fail-closed)
 */
export async function assertSafeHttpUrl(raw, lookup = lookupAll) {
  const u = String(raw || "").trim();
  if (!u) throw new SsrfError("رابط مفقود");
  if (u.length > 2048) throw new SsrfError("الرابط طويل جداً (الحد 2048 حرف)");

  let parsed;
  try { parsed = new URL(u); } catch { throw new SsrfError("رابط غير صالح"); }
  if (!/^https?:$/.test(parsed.protocol)) throw new SsrfError("يدعم http/https فقط");

  if (ALLOW_PRIVATE) return u; // مخرج صريح أدمني

  const host = parsed.hostname;
  if (isBlockedHostname(host)) throw new SsrfError("نطاق داخلي ممنوع");

  const literal = isBlockedLiteral(host);
  if (literal === true) throw new SsrfError("عنوان داخلي ممنوع");

  let addresses;
  if (literal === false) {
    // عنوان رقمي صريح وغير محجوب ⇒ لا حاجة لحلّ DNS
    addresses = [host.replace(/^\[|\]$/g, "")];
  } else {
    try {
      addresses = (await lookup(host)).map((r) => r.address).filter(Boolean);
    } catch {
      throw new SsrfError("تعذّر التحقق من هذا النطاق — رُفض الرابط"); // fail-closed
    }
  }

  for (const addr of addresses) {
    const bad = addr.includes(":") ? isBlockedIPv6(addr) : isBlockedIPv4(addr);
    if (bad) throw new SsrfError("النطاق يشير إلى عنوان داخلي — ممنوع");
  }
  return u;
}