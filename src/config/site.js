/**
 * رابط الموقع الرسمي — مصدر واحد تستهلكه الترويسة والفوتر وصفحة "من نحن".
 *
 * لماذا دالة لا ثابت؟ Vite يستبدل `import.meta.env` وقت البناء، لكن
 * `vi.stubEnv` في الاختبارات يغيّره بعد تحميل Modules ⇒ القراءة وقت الرسم
 * تُبقي البناء والاختبارين يعملين بنفس الدالة.
 *
 * لماذا https فقط؟ رابط `http://` داخل صفحة `https://` يُنزَّل mixed-content
 * فيُعطَّل ⇒ يبدو للمستخدم رابطاً ميتاً. ولا نخمّن عنواناً: بلا
 * VITE_SITE_URL نخفي الرابط كله بدل عرض عنوان خاطئ.
 */
export function siteUrl() {
  const raw = String(import.meta.env.VITE_SITE_URL || "").trim();
  return /^https:\/\//i.test(raw) ? raw.replace(/\/+$/, "") : "";
}

/** روابط الحسابات — نفس المبدأ: لا يظهر إلا ما ضُبط فعلاً في البيئة. */
export function socialLinks() {
  return [
    { key: "github", label: "GitHub", href: import.meta.env.VITE_SOCIAL_GITHUB },
    { key: "x", label: "X", href: import.meta.env.VITE_SOCIAL_X },
    { key: "discord", label: "Discord", href: import.meta.env.VITE_SOCIAL_DISCORD },
  ].filter((s) => /^https:\/\//i.test(String(s.href || "")));
}
