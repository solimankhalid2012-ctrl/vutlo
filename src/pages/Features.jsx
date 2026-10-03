import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import LinkInput from "../components/downloader/LinkInput.jsx";
import { useLang } from "../context/LangContext.jsx";
// مصدر واحد مع Home — لا تُكرَّر القوائم (كانتا تختلفان في الادعاءات)
import { liveFeatures } from "../data/features.js";

export default function Features() {
  const { t, lang } = useLang();
  // ⚠️ المتاح فعلاً فقط: الميزات الموسومة "قريباً" لا تُعرض إطلاقاً حتى
  // ينفّذها الكود ويُختبر (قاعدة الصدق أعلى من كسب بريق بصري).
  const list = liveFeatures(lang);

  return (
    <>
      <Helmet>
        <title>{t("nav.features")} — VideoVault Pro</title>
        <meta name="description" content={t("features.subtitle")} />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-center text-3xl font-black">{t("features.title")}</h1>
        <p className="mt-2 text-center text-white/60">
          {t("features.subtitle")} • <span className="chip">✅ {list.length} {lang === "ar" ? "متاح الآن" : "live now"}</span>
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(([icon, title, desc]) => (
            <div key={title} className="card hover:border-emerald/50">
              <div className="text-3xl">{icon}</div>
              <h3 className="mt-2 font-black">{title}</h3>
              <p className="mt-1 text-sm text-white/55">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-2xl"><LinkInput compact /></div>
      </main>
      <Footer />
    </>
  );
}
