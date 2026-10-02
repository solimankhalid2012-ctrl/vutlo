import React from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import LinkInput from "../components/downloader/LinkInput.jsx";
import { useLang } from "../context/LangContext.jsx";
import { Reveal } from "../components/common/Reveal.jsx";

/**
 * Download — رابط العمل الكامل.
 * الأدوات كلها (فيديو/صوت/GIF/ضغط/قائمة تشغيل/جدولة) داخل البطاقة الموحدة.
 */
export default function Download() {
  const { t } = useLang();
  const [search] = useSearchParams();
  const sharedUrl = search.get("url") || ""; // من إضافة المتصفح / المشاركة

  return (
    <>
      <Helmet>
        <title>{t("download.title")} — VideoVault Pro</title>
        <meta name="description" content={t("download.subtitle")} />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Reveal>
          <h1 className="text-3xl font-black">{t("download.title")}</h1>
          <p className="mt-2 text-white/60">{t("download.subtitle")}</p>
        </Reveal>

        <div className="mt-6">
          <LinkInput key={sharedUrl} initialUrl={sharedUrl} />
        </div>
      </main>
      <Footer />
    </>
  );
}
