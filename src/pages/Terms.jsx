import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";

/** الشروط + DMCA */
export default function Terms() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const secs = ar ? [
    ["✅ الاستخدام المقبول", "حمّل فقط المحتوى الذي تملكه أو المرخّص لك. يُمنع إساءة استخدام الخدمة أو تجاوز الحدود."],
    ["⚖️ حقوق النشر وDMCA", "نحترم قانون الألفية للملكية الرقمية. للإبلاغ عن انتهاك: support@vutlo.com مع الرابط وإثبات الملكية، ونرد خلال 48 ساعة."],
    ["🚫 إخلاء المسؤولية", "الخدمة أداة تقنية تُقدَّم كما هي دون ضمانات. المستخدم مسؤول قانونياً عن المحتوى الذي يحمّله."],
    ["🔄 التعديلات", "قد نحدّث هذه الشروط؛ الاستمرار في الاستخدام يعني القبول."],
  ] : [
    ["✅ Acceptable use", "Download only content you own or are licensed to use. Abuse or limit bypass is forbidden."],
    ["⚖️ Copyright & DMCA", "We respect the DMCA. Report violations to support@vutlo.com with URL and proof; we respond within 48h."],
    ["🚫 Disclaimer", "A utility provided as-is without warranties. Users are legally responsible for what they download."],
    ["🔄 Changes", "We may update these terms; continued use means acceptance."],
  ];
  return (
    <>
      <Helmet><title>{ar ? "الشروط والأحكام" : "Terms"} — Vutlo</title></Helmet>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-black">📜 {ar ? "الشروط والأحكام" : "Terms of Service"}</h1>
        <div className="mt-6 space-y-3">{secs.map(([h, p]) => <div key={h} className="card"><h2 className="font-black">{h}</h2><p className="mt-1 text-sm leading-relaxed text-white/65">{p}</p></div>)}</div>
      </main>
      <Footer />
    </>
  );
}
