import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import FileScanner from "../components/lab/FileScanner.jsx";
import Uploader from "../components/lab/Uploader.jsx";
import GifFromVideo from "../components/lab/GifFromVideo.jsx";
import { toolsLabel, TOOLS_EMOJI } from "../config/tools.js";
import "../styles/lab.css";

const TABS = [
  { id: "scan", icon: "🔬", ar: "فحص الملفات", en: "Scan files" },
  { id: "upload", icon: "⬆️", ar: "رفع برابط دائم", en: "Upload for a link" },
  { id: "gif", icon: "🎞️", ar: "فيديو ⇒ GIF", en: "Video ⇒ GIF" },
];

/**
 * 🔧 أدوات الملفات — ثلاث أدوات في صفحة واحدة.
 *
 * كل أداة تعمل على المتصفح أولاً (فحص فوري بلا رفع) ثم للسيرفر عند الحاجة،
 * فالرفع لا يحدث إلا لمحتوى نظيف: وما يُرفع يمرّ على نفس الماسح في الخادم
 * — طبقة ثانية، لأن الطلب قد يأتي من عميل غير هذا الموقع.
 */
export default function Lab() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [tab, setTab] = useState("scan");

  return (
    <>
      <Helmet>
        <title>{toolsLabel(lang)} — Vutlo</title>
        <meta name="description" content={ar ? "مختبر الملفات: فحص، رفع برابط دائم، وفيديو ⇒ GIF" : "File lab: scan, permanent upload link, and video ⇒ GIF"} />
      </Helmet>
      <Header />
      <main className="lab-bg mx-auto max-w-screen-xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="lab-hero">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {TOOLS_EMOJI} {toolsLabel(lang)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60 sm:text-base">
            {ar
              ? "افحص ملفاتك، ارفعها على رابط دائم، وحوّل أي فيديو إلى GIF متحرك."
              : "Scan your files, host them behind a permanent link, and turn any video into an animated GIF."}
          </p>
        </div>

        <div className="lab-tabs" role="tablist" aria-label={toolsLabel(lang)}>
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`lab-tab ${tab === x.id ? "is-active" : ""}`}
              data-testid={`lab-tab-${x.id}`}
            >
              <span aria-hidden="true">{x.icon}</span>
              <span>{ar ? x.ar : x.en}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" className="lab-body">
          {tab === "scan" && <FileScanner />}
          {tab === "upload" && <Uploader />}
          {tab === "gif" && <GifFromVideo />}
        </div>
      </main>
      <Footer />
    </>
  );
}
