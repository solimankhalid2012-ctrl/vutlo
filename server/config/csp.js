import { createHash } from "crypto";

/** sha256 بصيغة base64 كما تتوقعها CSP (وليس hex). */
export function sha256Base64(text) {
  return createHash("sha256").update(String(text), "utf8").digest("base64");
}

/**
 * سياسة أمان المحتوى (CSP) — مصدر واحد للحقيقة.
 *
 * ⚠️ المشكلة التي أصلحناها: `helmet()` بلا تخصيص ⇒ CSP الافتراضي:
 *   • script-src 'self'  ⇒ يحجب السكربتين inline في index.html، وخصوصاً
 *     سكربت ضبط اللغة/الاتجاه قبل الرسم ⇒ الوميض الأحمر يعود، وأي خطأ
 *     قبل تحميل React يظهر كـ"Unexpected end of JSON input".
 *   • img-src 'self' data: ⇒ يحجب **كل** الصور الخارجية: مصغّرات يوتيوب
 *     (i.ytimg.com) ومصغّرات منصات مثل Pinterest ⇒ صور مكسورة في الواجهة.
 *
 * الحل: نسمح فقط لما يحتاجه التطبيق فعلاً بدل تعطيل الحماية:
 *  - السكربتان تُسمح لهما بـsha256 **لا** بـ'unsafe-inline'، فأي سكربت آخر
 *    مُدرج لاحقاً يظل محجوباً. البصمات متطابقة في index.html و dist/index.html
 *    (Vite لا يمسّ نص السكربتات) ⇒ تعمل في dev و prod.
 *    ⚠️ بعد أي تعديل على محتوى السكربتات شغّل `node csp-hashes.mjs`،
 *    و`tests/csp.test.js` يفشل إن نسيت.
 *  - 'unsafe-inline' في style-src فقط: React يضبط style={{...}} داخل JSX،
 *    وخطوط Google من fonts.googleapis.com.
 */
/**
 * بصمات base64 للسكربتين inline (مع حرف نهاية السطر "=" كما هي).
 * نبني رمز CSP في الكود بدل كتابته يدوياً: فقدان "=" في نهاية البصمة يجعل
 * المتصفح يرفضها بصمت — وهذا بالضبط ما كشفه اختبار csp.test.js.
 */
export const SCRIPT_DIGESTS = {
  lang: "oNT7OWkOi8QRFNbp9DA7k2F08BIQf5Uij15lkXgeSc0=", // ضبط lang/dir قبل الرسم
  jsonld: "Ii5kBp7PJaWQpb2r7yU0DSqxZeH4HGJiFhP1OZ5LFys=", // JSON-LD (SEO)
};

/** رموز CSP الجاهزة: 'sha256-<base64>' */
export const CSP_SCRIPT_HASHES = Object.values(SCRIPT_DIGESTS).map((d) => `'sha256-${d}'`);

/** نفس الترتيب الذي يُسلّم إلى helmet. */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  // 🔒 بلا 'unsafe-inline': السكربتان المسموحتان ببصمة فقط
  scriptSrc: ["'self'", ...CSP_SCRIPT_HASHES],
  scriptSrcAttr: ["'none'"],
  // ⚠️ 'unsafe-inline' هنا مقصود ومحدود: أنماط React داخل JSX + خطوط Google
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  // المصغّرات تأتي من منصة رابط المستخدم (1000+ موقع) ⇒ نحتاج https:،
  // وblob: للمعاينات المحلية. البديل الأضيق: بروكسي مصغّرات من السيرفر.
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  mediaSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  manifestSrc: ["'self'"],
};

/**
 * يستخرج بصمات sha256 لكل سكربت inline في HTML.
 * @param {string} html
 * @returns {string[]} بصمات بصيغة 'sha256-…'
 */
export function inlineScriptHashes(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(String(html)))) {
    if (m[1].includes("src=")) continue; // سكربت خارجي = 'self' يكفي
    out.push(`'sha256-${sha256Base64(m[2])}'`);
  }
  return out;
}