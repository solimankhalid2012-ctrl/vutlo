import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";

/** سياسة الخصوصية */
export default function Privacy() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const secs = ar ? [
    ["📦 البيانات التي نجمعها", "البريد (عند التسجيل فقط)، وروابط التحميل، وسجلات تقنية أساسية لتشغيل الخدمة. السجلات المحفوظة على السيرفر خاصّة بحسابك وحده ولا تُعرض لأي زائر آخر. لا نبيع بياناتك."],
    ["🍪 ملفات تعريف الارتباط", "نستخدم LocalStorage وCookies لحفظ اللغة والثيم وتوكن الجلسة فقط. لا نستخدم كوكيز تتبّع إعلانية."],
    ["🌐 خدمات خارجية", "الخطوط من Google Fonts، ورمز QR يُطلب من api.qrserver.com فيرسل ذلك رابط الفيديو إلى هذه الخدمة. لا نشارك بياناتك مع أي طرف ثالث عدا ذلك، ولا تُفعَّل أي شبكة إعلانية حالياً."],
    ["🗑️ مدة الاحتفاظ", "سجل التحميلات يبقى ما دام الحساب موجوداً، ويُحذف نهائياً بطلب منك أو بحذف الحساب."],
    ["✏️ حقوقك", "يمكنك طلب تصدير أو حذف بياناتك عبر support@vutlo.com في أي وقت."],
  ] : [
    ["📦 Data we collect", "Email (on signup only), download links and basic operational logs. Stored server history is private to your account and never shown to other visitors. We never sell your data."],
    ["🍪 Cookies", "LocalStorage and cookies store language, theme and session only. We use no advertising trackers."],
    ["🌐 Third-party services", "Fonts are served by Google Fonts, and QR images are requested from api.qrserver.com, which therefore receives that video link. No data is shared with anyone else, and no ad network is currently enabled."],
    ["🗑️ Retention", "Download history is kept while your account exists, and is permanently deleted on request or when the account is removed."],
    ["✏️ Your rights", "Request export or deletion anytime via support@vutlo.com."],
  ];
  return (
    <>
      <Helmet><title>{ar ? "سياسة الخصوصية" : "Privacy Policy"} — Vutlo</title></Helmet>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-black">🔒 {ar ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
        <div className="mt-6 space-y-3">{secs.map(([h, p]) => <div key={h} className="card"><h2 className="font-black">{h}</h2><p className="mt-1 text-sm leading-relaxed text-white/65">{p}</p></div>)}</div>
      </main>
      <Footer />
    </>
  );
}
