import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { siteUrl } from "../config/site.js";
import { toolsLabel, TOOLS_EMOJI } from "../config/tools.js";

/** من نحن */
export default function About() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const SITE = siteUrl(); // لا يظهر إلا إن ضُبط VITE_SITE_URL ولا نخمّن عنواناً
  return (
    <>
      <Helmet><title>{ar ? "من نحن" : "About"} — Vutlo</title></Helmet>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-black">ℹ️ {ar ? "من نحن" : "About us"}</h1>
        <div className="card mt-6 space-y-4 leading-loose text-white/75">
          <p>{ar ? "Vutlo أداة تحميل فيديو ذكية: الصق رابطاً من 1000+ موقع واحصل عليه بجودة حتى 8K وبدون علامة مائية. نبني للسرعة والخصوصية واحترام حقوق النشر." : "Vutlo is a smart video downloading utility: paste a link from 1000+ sites and get it in up to 8K with no watermark. Built for speed, privacy and copyright respect."}</p>
          <p>{ar ? "التقنيات: React + Vite + TailwindCSS للواجهة، وNode.js + yt-dlp + FFmpeg للمحرك، مع دعم PWA وعشر لغات." : "Stack: React + Vite + TailwindCSS frontend, Node.js + yt-dlp + FFmpeg engine, with PWA and 10 languages."}</p>
          <p>{ar ? "نحن أداة Utility — لسنا شبكة اجتماعية ولا نستضيف أي محتوى." : "We are a utility tool — not a social network, and we host no content."}</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[["48M+", ar ? "تحميل" : "downloads"], ["1000+", ar ? "موقع" : "sites"], ["10", ar ? "لغات" : "languages"]].map(([v, l]) => (
            <div key={l} className="card !p-4"><div className="text-2xl font-black text-emerald">{v}</div><div className="text-xs text-white/55">{l}</div></div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/lab" className="btn-ghost">{TOOLS_EMOJI} {toolsLabel(lang)}</Link>
          <Link to="/contact" className="btn-primary">{ar ? "تواصل معنا" : "Contact us"}</Link>
          {SITE && (
            <a href={SITE} target="_blank" rel="noopener noreferrer" className="btn-ghost" data-testid="about-site">
              🌐 {ar ? "الموقع الرسمي" : "Official website"}
            </a>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
