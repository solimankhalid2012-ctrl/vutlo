import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { LANGS } from "../../hooks/useLanguage.js";

/** أيقونة كوكب بتدرّج — بديل بصري للقائمة المنسدلة القديمة */
const Globe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

/**
 * 🌐 LanguageMenu — قائمة لغات بلمسة تقنية بدل <select> أصيل.
 *
 * لماذا ليست <select>؟ لا يمكن تنسيق عناصرها على الأنظمة/Linux، فبدت
 * foreign وتُقفل بخط النظام لا بالخط الموقع. كما لا تدعم فتحاً بالـEscape
 * ولا تُغلق بالنقر خارجها ولا تُعلن حالتها لقارئات الشاشة. هنا: قائمة
 * بأزرار، إغلاق بـEscape/خارجها/اختيار، aria-expanded، وتمرير بلوحة المفاتيح.
 *
 * @param {string} variant  "solid" (داخل الترويسة) | "ghost" (نص عادي)
 * @param {boolean} alignEnd  محاذاة لليمين (مناسب للترويسة)
 */
export default function LanguageMenu({ variant = "solid", alignEnd = false }) {
  const { lang, changeLang } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Language: ${current.label}`}
        className={`lang-menu-btn ${variant === "ghost" ? "lang-menu-ghost" : ""}`}
        data-testid="lang-menu-btn"
      >
        <Globe />
        <span className="lang-menu-code">{current.code.toUpperCase()}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
          className={`lang-menu-chevron ${open ? "is-open" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            role="listbox"
            aria-label="Languages"
            className={`lang-menu-pop ${alignEnd ? "lang-menu-pop-end" : ""}`}
            data-testid="lang-menu-pop"
          >
            <div className="lang-menu-grid">
              {LANGS.map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { changeLang(l.code); setOpen(false); }}
                    className={`lang-item ${active ? "is-active" : ""}`}
                    data-testid={`lang-${l.code}`}
                  >
                    <span className="lang-item-code">{l.code.toUpperCase()}</span>
                    <span className="lang-item-label">{l.label}</span>
                    {l.rtl && <span className="lang-item-rtl" title="RTL">⇄</span>}
                    {active && <span className="lang-item-tick" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
