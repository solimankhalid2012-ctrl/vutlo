import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

/** قراءة الوضع المحفوظ مسبقاً (الوضع الافتراضي: ليلي). */
function readStoredTheme() {
  try {
    const saved = window.localStorage.getItem("vv-theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

/** تطبيق الوضع على <html> — يُستدعى قبل الرسم الأول فلا occurs وميض. */
function applyTheme(theme) {
  if (!isBrowser) return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // يبقى للاحتكام مع أي تنسيقات dark: أو إضافات
  root.classList.toggle("dark", theme === "dark");
  try { window.localStorage.setItem("vv-theme", theme); } catch {}
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  // ⚠️ useLayoutEffect لا useEffect: مع useEffect يظهر وميض — صفحة داكنة
  // ثم تُقلب إلى النهاري بعد أول رسم.
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);

  // مزامنة بين تبويبات المتصفح الأخرى على نفس الأصل
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "vv-theme" && (e.newValue === "light" || e.newValue === "dark")) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const value = React.useMemo(() => ({ theme, toggle, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;