import React from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../context/LangContext.jsx";
import { Logo } from "./Logo.jsx";

/** شعارات الحسابات — تُعرض فقط إن ضُبط رابطها في البيئة */
const ICONS = {
  github: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
  ),
  x: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
  ),
  discord: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.482 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.675 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.083.083 0 00.031.057 19.9 19.9 0 005.992 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-.197.076.076 0 00.041-.106 13.107 13.107 0 00-.445-.967.077.077 0 01-.007-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a10.196 10.196 0 00.363.292.077.077 0 01-.006.128 13.292 13.292 0 00-.455.957.077.077 0 00.031.098 14.07 14.07 0 001.195.204.077.077 0 00.084.028 19.839 19.839 0 006.001-3.03.077.077 0 00.032-.051C24.332 13.535 23.484 9.064 20.349 4.397a.061.061 0 00-.032-.027zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
  ),
};

export default function Footer() {
  const { t } = useLang();

  // ⚠️ كانت روابط الحسابات الثلاث ثابتة على صفحات عامة (github.com/twitter.com/
  // discord.com) لا حسابات المشروع ⇒ تبدو روابط رسمية وهي ليست كذلك.
  // الآن تُقرأ من متغيّرات البيئة ولا يظهر إلا ما ضُبط فعلاً.
  const SOCIAL = [
    { key: "github", label: "GitHub", href: import.meta.env.VITE_SOCIAL_GITHUB },
    { key: "x", label: "X", href: import.meta.env.VITE_SOCIAL_X },
    { key: "discord", label: "Discord", href: import.meta.env.VITE_SOCIAL_DISCORD },
  ].filter((s) => /^https:\/\//.test(String(s.href || "")));

  const columns = [
    {
      title: <span className="flex items-center gap-2"><Logo size={28} /> <span className="text-lg font-black">Video<span className="text-emerald">Vault</span> Pro</span></span>,
      items: (
        <p className="mt-3 text-sm text-white/50 leading-relaxed max-w-xs">
          {t("footer.tagline")}
        </p>
      ),
    },
    {
      title: t("footer.product"),
      items: (
        <ul className="space-y-2.5">
          {["features", "download", "history", "blog"].map((k) => (
            <li key={k}><Link to={`/${k}`} className="text-sm text-white/60 hover:text-emerald hover:translate-x-1 transition-all">{t(`nav.${k}`)}</Link></li>
          ))}
        </ul>
      ),
    },
    {
      title: t("footer.company"),
      items: (
        <ul className="space-y-2.5">
          {["about", "contact"].map((k) => (
            <li key={k}><Link to={`/${k}`} className="text-sm text-white/60 hover:text-emerald hover:translate-x-1 transition-all">{t(`nav.${k}`)}</Link></li>
          ))}
        </ul>
      ),
    },
    {
      title: t("footer.legal"),
      items: (
        <ul className="space-y-2.5">
          {["privacy", "terms"].map((k) => (
            <li key={k}><Link to={`/${k}`} className="text-sm text-white/60 hover:text-emerald hover:translate-x-1 transition-all">{t(`nav.${k}`)}</Link></li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <footer className="relative border-t border-white/10 bg-gradient-to-t from-void via-void-50 to-transparent">
      {/* توهج خلفي */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald/10 rounded-full blur-3xl pointer-events-none" />

      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((col, i) => (
            <div key={i} className="hover-lift">
              <div className="font-black text-lg">{col.title}</div>
              <div className="mt-4">{col.items}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-white/40">
              <span>© 2026 VideoVault Pro. {t("footer.rights")}</span>
              <span className="hidden sm:inline">•</span>
              <span className="text-emerald/50 font-medium">{t("footer.disclaimerTitle").replace("⚖️ ", "")}</span>
            </div>
            {SOCIAL.length > 0 && (
              <div className="flex items-center gap-4">
                {SOCIAL.map((s) => (
                  <a
                    key={s.key}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:border-emerald/50 hover:bg-emerald/10 hover:text-emerald transition-all"
                    aria-label={s.label}
                  >
                    {ICONS[s.key]}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
