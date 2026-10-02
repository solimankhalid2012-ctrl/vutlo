import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/common/Reveal.jsx";

/** الأسعار — مجاني (حتى 1080p) / Pro $4.99 (بلا إعلانات + فوق 1080p) */
export default function Pricing() {
  const { lang } = useLang();
  const ar = lang === "ar";

  const plans = [
    {
      n: ar ? "المجانية" : "Free",
      p: "$0",
      per: ar ? "/ للأبد" : "/ forever",
      hot: false,
      f: ar
        ? [
            "✅ تنزيل من 1000+ موقع (يوتيوب، تيك توك، إنستغرام، X…)",
            "✅ جودة تصل إلى 1080p كاملة",
            "✅ MP4 و WebM و MKV",
            "✅ استخراج الصوت MP3 بجودة 320kbps",
            "✅ تحويل إلى GIF وضغط الفيديو",
            "✅ قوائم التشغيل + الجدولة",
            "✅ سجل التحميلات ومشاركة الرابط",
            "✅ بدون إعلانات",
            "🚫 لا يدعم أعلى من 1080p",
          ]
        : [
            "✅ Download from 1000+ sites (YouTube, TikTok, Instagram, X…)",
            "✅ Full quality up to 1080p",
            "✅ MP4, WebM and MKV",
            "✅ MP3 audio extraction at 320kbps",
            "✅ GIF conversion and video compression",
            "✅ Playlists + scheduler",
            "✅ Download history and link sharing",
            "✅ Ad-free",
            "🚫 No quality above 1080p",
          ],
    },
    {
      n: "Pro",
      p: "$4.99",
      per: ar ? "/شهر" : "/month",
      hot: true,
      f: ar
        ? [
            "✅ كل مزايا الخطة المجانية",
            "✅ جودة حتى 8K (1440p / 2160p / 4320p)",
            "✅ تحميلات غير محدودة بدون حد يومي",
            "✅ أولوية في الطابور وسرعة أعلى",
            "✅ تنزيل جماعي من قوائم التشغيل",
            "✅ دعم VIP عبر بريد إلكتروني",
          ]
        : [
            "✅ Everything in the Free plan",
            "✅ Completely ad-free",
            "✅ Quality up to 8K (1440p / 2160p / 4320p)",
            "✅ Unlimited downloads, no daily cap",
            "✅ Priority queue and faster speeds",
            "✅ Bulk download from playlists",
            "✅ VIP support over email",
          ],
    },
  ];

  const rows = ar
    ? [
        ["أعلى جودة", "1080p", "8K (4320p)"],
        ["الإعلانات", "لا شيء", "لا شيء"],
        ["عدد التحميلات", "غير محدود", "غير محدود بأولوية"],
        ["MP3 / GIF / ضغط", "✅", "✅"],
        ["قوائم التشغيل والجدولة", "✅", "✅ + تنزيل جماعي"],
        ["الدعم", "بريد", "VIP"],
      ]
    : [
        ["Max quality", "1080p", "8K (4320p)"],
        ["Ads", "None", "None"],
        ["Downloads", "Unlimited", "Unlimited + priority"],
        ["MP3 / GIF / compress", "✅", "✅"],
        ["Playlists & scheduler", "✅", "✅ + bulk download"],
        ["Support", "Email", "VIP"],
      ];

  return (
    <>
      <Helmet><title>{ar ? "الأسعار" : "Pricing"} — VideoVault Pro</title></Helmet>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Reveal>
          <h1 className="text-center text-3xl font-black">💎 {ar ? "الأسعار" : "Pricing"}</h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/60">
            {ar
              ? "ابدأ مجاناً بجودة 1080p، أو ارتقِ إلى Pro للحصول على 8K بدون إعلانات."
              : "Start free at 1080p, or upgrade to Pro for 8K with zero ads."}
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 md:grid-cols-2" step={0.09}>
          {plans.map((pl) => (
            <StaggerItem key={pl.n} y={12} className="relative">
              <div className={`card relative h-full text-center ${pl.hot ? "!border-emerald shadow-glow" : ""}`}>
                {/* ⚠️ start-1/2 منطقي (من الحافة اليسرى في LTR واليمنى في RTL)
                    بينما -translate-x-1/2 فيزيائي ⇒ في العربية تنزاح الشارة
                    نصف عرضها. left-1/2 فيزيائي ويتوافق مع الاتجاهين. */}
                {pl.hot && <span className="chip absolute -top-3 left-1/2 -translate-x-1/2">⭐ {ar ? "الأكثر شعبية" : "Most popular"}</span>}
                <h2 className="mt-2 text-xl font-black">{pl.n}</h2>
                <div className="mt-1 text-4xl font-black text-emerald">
                  {pl.p}<span className="text-sm text-white/50">{pl.per}</span>
                </div>
                <ul className="mt-5 space-y-2 text-start text-sm text-white/75">
                  {pl.f.map((f, i) => <li key={`${i}-${f}`}>{f}</li>)}
                </ul>
                {pl.hot ? (
                  <a href="mailto:pro@videovault.pro?subject=VideoVault%20Pro" className="btn-primary mt-6 w-full">💎 {ar ? "اشترك بـ $4.99/شهر" : "Subscribe $4.99/mo"}</a>
                ) : (
                  <Link to="/register" className="btn-ghost mt-6 w-full">{ar ? "ابدأ مجاناً" : "Start free"}</Link>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.06}>
          <div className="card mt-10 overflow-x-auto">
            <h2 className="text-lg font-black">⚖️ {ar ? "مقارنة الخطة" : "Plan comparison"}</h2>
            <table className="mt-4 w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-start">
                  <th className="p-3 text-start font-black">{ar ? "الميزة" : "Feature"}</th>
                  <th className="p-3 text-start font-black">{ar ? "مجاني" : "Free"}</th>
                  <th className="p-3 text-start font-black text-emerald">Pro</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([f, a, b]) => (
                  <tr key={f} className="border-b border-white/5">
                    <td className="p-3 font-bold">{f}</td>
                    <td className="p-3 text-white/60">{a}</td>
                    <td className="p-3 text-emerald">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mt-6 text-center text-xs text-white/40">
            {ar
              ? "الدفع شهري عبر بريد إلكتروني — التفعيل فوري بعد التأكيد."
              : "Monthly billing by email — activated right after confirmation."}
          </p>
        </Reveal>
      </main>
      <Footer />
    </>
  );
}
