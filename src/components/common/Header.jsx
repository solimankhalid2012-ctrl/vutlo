import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useLanguage } from "../../hooks/useLanguage.js";
import { currentUser, logoutUser, me, isLoggedIn } from "../../services/authApi.js";
import { Logo } from "./Logo.jsx";

export default function Header() {
  const { t, lang, changeLang } = useLang();
  const ar = lang === "ar";
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const { LANGS } = useLanguage();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const NAV_ITEMS = [
    { path: "", key: "nav.home" },
    { path: "/features", key: "nav.features" },
    { path: "/blog", key: "nav.blog" },
  ];
  const isActive = (path) => (path === "" ? pathname === "/" : pathname.startsWith(path));
  const [user, setUser] = useState(() => currentUser());
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // جلب بيانات المستخدم مرة واحدة فقط: بعد أول فشل نمسح التوكن حتى لا تتكرر الطلبات
  useEffect(() => {
    if (!isLoggedIn()) return;
    let cancelled = false;
    me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        try { localStorage.setItem("vv-user", JSON.stringify(u)); } catch {}
      })
      .catch(() => {
        if (cancelled) return;
        // توكن منتهٍ/غير صالح — امسحه محلياً حتى لا يعيد المحاولة كل تحميل للصفحة
        logoutUser();
        setUser(null);
      });
    return () => { cancelled = true; };
  }, []);

  const out = () => { logoutUser(); setUser(null); nav("/"); setMobileOpen(false); };

  // ⚠️ كان يبقى مفتوحاً عند تغيير المسار (فارغاً) ولا يُغلق بالـEscape ولا بالنقر خارجه
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    const onDown = (e) => {
      // نقفل فقط عند النقر خارج الترويسة (nav sticky)، لا على أي نقرة داخلها
      if (e.target instanceof Node && !e.target.closest("header")) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [mobileOpen]);

  // ⚠️ يقفل التمرير خلف القائمة المفتوحة (iOS/Android)
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-void/95 backdrop-blur-2xl border-b border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]" : "bg-void/80 backdrop-blur-xl"}`}>
      <nav className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5" aria-label="VideoVault Pro Home">
            <Logo size={36} animated />
            <span className="hidden sm:block text-xl font-black tracking-tight">
              Video<span className="text-emerald">Vault</span>
              <span className="ml-1.5 rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-extrabold text-mint uppercase tracking-wider">Pro</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {NAV_ITEMS.map(({ path, key }) => (
              <Link
                key={path || "/"}
                to={path || "/"}
                className={`px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${isActive(path)
                  ? "bg-emerald/15 text-emerald"
                  : "text-white/70 hover:text-white hover:bg-white/5"}`}
              >
                {t(key)}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <select
                value={lang}
                onChange={(e) => changeLang(e.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 pr-8 text-xs font-bold text-white focus:border-emerald/50 focus:ring-2 focus:ring-emerald/20 focus:bg-white/10 cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code} className="bg-void-200">{l.label}</option>
                ))}
              </select>
            </div>

            {/* Theme Switch — مقبض منزلق: أيقونة الوضع الحالي داخل المقبض، والأخرى في الطرف المقابل */}
            <button
              onClick={toggle}
              role="switch"
              aria-checked={isDark}
              aria-label={isDark ? (ar ? "التبديل إلى الوضع النهاري" : "Switch to light mode") : (ar ? "التبديل إلى الوضع الليلي" : "Switch to dark mode")}
              title={isDark ? (ar ? "نهاري" : "Light") : (ar ? "ليلي" : "Dark")}
              className="theme-switch relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-emerald/30 bg-void-200 transition-colors duration-300 hover:border-emerald/60"
            >
              {/* أيقونة الوضع الآخر، باهتة، في الطرف المقابل */}
              <span
                className="theme-switch-target absolute top-1/2 -translate-y-1/2 text-[11px] leading-none opacity-45"
                style={{ insetInlineEnd: 9 }}
                aria-hidden="true"
              >
                {isDark ? "🌞" : "🌙"}
              </span>
              {/* المقبض + أيقونة الوضع الحالي */}
              <span
                className="theme-switch-knob absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald to-emerald-dark text-[11px] leading-none shadow-[0_2px_10px_rgba(29,185,84,0.55)] transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]"
                style={{ insetInlineStart: isDark ? 28 : 4 }}
                aria-hidden="true"
              >
                {isDark ? "🌙" : "🌞"}
              </span>
            </button>

            {/* User / Auth */}
            <AnimatePresence mode="wait">
              {user ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2"
                >
                  <span className="hidden sm:block badge badge-emerald">🏆 {user.points ?? 0}</span>
                  <button onClick={out} className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:border-emerald/50 hover:bg-emerald/10 hover:text-emerald transition-all" title="Logout">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2"
                >
                  <Link to="/login" className="btn-ghost-sm">👤 {t("nav.login")}</Link>
                  <Link to="/download" className="btn-primary-sm">⬇️ {t("nav.download")}</Link>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:border-emerald/50 hover:bg-emerald/10 hover:text-emerald transition-all"
              aria-label="Menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mobileOpen ? <path d="M6 18L18 6M6 6l12 12"/> : <path d="M3 12h18M3 6h18M3 18h18"/>}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden overflow-hidden border-t border-white/10 pt-4 pb-6"
            >
              <div className="flex flex-col gap-2">
                {NAV_ITEMS.map(({ path, key }) => (
                  <Link
                    key={path || "/"}
                    to={path || "/"}
                    onClick={() => setMobileOpen(false)}
                    className={`px-3 py-3 rounded-xl text-base font-bold transition-colors ${isActive(path)
                      ? "bg-emerald/15 text-emerald"
                      : "text-white/70 hover:text-white hover:bg-white/5"}`}
                  >
                    {t(key)}
                  </Link>
                ))}
                {/* ⚠️ على الجوال كان زرّا الدخول والتحميل مخفيين (sm:block / sm فقط)
                    ولا بديل عنهما في القائمة ⇒ لا سبيل لتسجيل الدخول على الجوال. */}
                <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
                  {user ? (
                    <>
                      <span className="px-3 py-1 text-sm font-bold text-white/60">🏆 {user.points ?? 0}</span>
                      <button
                        onClick={out}
                        className="px-3 py-3 rounded-xl text-base font-bold text-red-300 hover:bg-red-500/10"
                      >
                        ⏻ {t("nav.logout") || "تسجيل الخروج"}
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to="/login" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-xl text-base font-bold text-white/80 hover:bg-white/5">
                        👤 {t("nav.login")}
                      </Link>
                      <Link to="/download" onClick={() => setMobileOpen(false)} className="btn-primary">
                        ⬇️ {t("nav.download")}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}