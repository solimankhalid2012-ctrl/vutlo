import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ar from "../locales/ar.json";
import en from "../locales/en.json";
import he from "../locales/he.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import de from "../locales/de.json";
import tr from "../locales/tr.json";
import fa from "../locales/fa.json";
import ur from "../locales/ur.json";
import id from "../locales/id.json";

// i18n ديناميكي خفيف — 10 لغات كاملة + RTL تلقائي (ar/he/fa/ur)
const DICTS = { ar, en, he, fr, es, de, tr, fa, ur, id };
const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);
const FALLBACK = "ar";

/** ⚠️ قيمة محفوظة/ممرّرة عشوائية (vv-lang=xx) كانت تبقى كما هي ⇒
 *  ت(مفتاح) ترجع المفتاح نفسه وتظهر الواجهة بلغة غير معروفة.
 *  نقبل اللغات المتاحة فقط، وإلا نرجع للافتراضي. */
const normalize = (l) => (Object.prototype.hasOwnProperty.call(DICTS, l) ? l : FALLBACK);

const LangContext = createContext(null);
export const useLang = () => useContext(LangContext);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem("vv-lang");
      if (stored) return normalize(stored);
      return normalize((navigator.language || FALLBACK).slice(0, 2).toLowerCase());
    } catch { return FALLBACK; }
  });

  const dict = DICTS[lang] || DICTS.en;
  const t = (key) => key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), dict) ?? key;
  const isRTL = RTL_LANGS.has(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    try {
      localStorage.setItem("vv-lang", lang);
      document.cookie = `vv-lang=${lang}; path=/; max-age=31536000`;
    } catch {}
  }, [lang, isRTL]);

  // النسخة، المحارف، والمفاتيح تُخزَّن دائماً ⇒ لا نشتقّ كائن قيمة جديداً كل render
  const changeLang = useCallback((l) => setLang(normalize(l)), []);
  const value = useMemo(() => ({ lang, changeLang, t, isRTL }), [lang, changeLang, isRTL, dict]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
