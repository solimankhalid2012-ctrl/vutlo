import { useState } from "react";
import { useLang } from "../context/LangContext.jsx";

/** اللغات المدعومة — معرّف ثابت على مستوى الوحدة، لأن مصفوفة تُعاد كل رندر
 *  تكسر أي useEffect يعتمد عليها. تُستخدم أيضاً للتحقق من مسار /:lang. */
export const LANGS = [
  { code: "ar", label: "العربية", rtl: true },
  { code: "en", label: "English", rtl: false },
  { code: "he", label: "עברית", rtl: true },
  { code: "fr", label: "Français", rtl: false },
  { code: "es", label: "Español", rtl: false },
  { code: "de", label: "Deutsch", rtl: false },
  { code: "tr", label: "Türkçe", rtl: false },
  { code: "fa", label: "فارسی", rtl: true },
  { code: "ur", label: "اردو", rtl: true },
  { code: "id", label: "Indonesia", rtl: false },
];

export const LANG_CODES = LANGS.map((l) => l.code);
export const isLang = (code) => LANG_CODES.includes(String(code || "").toLowerCase());

/** اكتشاف لغة المتصفح + تبديل فوري بدون reload — يُستخدم في الهيدر */
export function useLanguage() {
  const { lang, changeLang, isRTL: dirRTL } = useLang();
  const [open, setOpen] = useState(false);
  return { lang, changeLang, isRTL: dirRTL, open, setOpen, LANGS };
}
