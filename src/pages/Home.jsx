import React from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { Reveal, Stagger, StaggerItem, CountUp, EASE } from "../components/common/Reveal.jsx";
import LinkInput from "../components/downloader/LinkInput.jsx";
import { useLang } from "../context/LangContext.jsx";
// نفس مصدر Features — was a hardcoded Arabic list on a page that serves 10 languages
import { liveFeatures } from "../data/features.js";

/** إحصائية واحدة مع عدّاد رقمي */
function Stat({ label, value, suffix = "", decimals = 0 }) {
  return (
    <StaggerItem y={10} className="card !p-4 text-center">
      <div className="text-2xl font-black text-emerald">
        {decimals > 0 ? (
          <AnimatedDecimals to={value} decimals={decimals} suffix={suffix} />
        ) : (
          <><CountUp to={value} />{suffix}</>
        )}
      </div>
      <div className="text-xs text-white/55">{label}</div>
    </StaggerItem>
  );
}

/** عدّاد بفاصلة عشرية (مثل 4.9★) */
function AnimatedDecimals({ to, decimals, suffix }) {
  const ref = React.useRef(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setN(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / 1200, 1);
        setN(1 - Math.pow(1 - p, 4));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, decimals]);
  return <span ref={ref}>{n.toFixed(decimals)}{suffix}</span>;
}

/** الصفحة الرئيسية — تصميم أخضر/أسود مذهل + SEO + 30 ميزة */
export default function Home() {
  const { t, lang } = useLang();

  const platforms = [
    { icon: "▶️", name: "YouTube" }, { icon: "🎵", name: "TikTok" },
    { icon: "📸", name: "Instagram" }, { icon: "📘", name: "Facebook" },
    { icon: "𝕏", name: "X / Twitter" }, { icon: "🎬", name: "Vimeo" },
    { icon: "🎮", name: "Twitch" }, { icon: "🤖", name: "Reddit" },
    { icon: "📌", name: "Pinterest" }, { icon: "👻", name: "Snapchat" },
    { icon: "💼", name: "LinkedIn" }, { icon: "📺", name: "Dailymotion" },
    { icon: "🎧", name: "SoundCloud" }, { icon: "🔗", name: "+1000 موقع" },
  ];

  // ⚠️ كانت قائمة عربية مكتوبة داخل الصفحة التي تقدّم 10 لغات ⇒ الزائر
  // الإنجليزي يرى نصاً عربياً، وكانت تعلن ميزات غير منفَّذة (مساعد AI).
  // الآن: نفس مصدر صفحة Features، و"المتاح فقط" (بدون "قريباً").
  const features = liveFeatures(lang).slice(0, 12);

  const steps = [
    ["1️⃣", t("how.s1t"), t("how.s1d")],
    ["2️⃣", t("how.s2t"), t("how.s2d")],
    ["3️⃣", t("how.s3t"), t("how.s3d")],
  ];

  const faqs = [
    [t("faq.q1"), t("faq.a1")],
    [t("faq.q2"), t("faq.a2")],
    [t("faq.q3"), t("faq.a3")],
    [t("faq.q4"), t("faq.a4")],
  ];

  return (
    <>
      <Helmet>
        <title>{t("seo.homeTitle")}</title>
        <meta name="description" content={t("seo.homeDesc")} />
      </Helmet>
      <Header />

      <main className="mx-auto max-w-7xl px-4">
        {/* ── HERO ── */}
        <section className="relative py-14 text-center sm:py-20">
          <div className="pointer-events-none absolute inset-0 -z-10 mx-auto h-72 w-72 rounded-full bg-glow-green blur-3xl" />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <span className="chip !text-sm">⚡ Smart Link Recognition Engine · &lt;500ms</span>
            <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              {t("hero.title1")} <span className="bg-gradient-to-l from-emerald to-mint bg-clip-text text-transparent">{t("hero.titleGreen")}</span>
              <br />{t("hero.title2")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-white/60 sm:text-lg">{t("hero.subtitle")}</p>
          </motion.div>

          {/* إدخال الرابط الذكي */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.7, ease: EASE }}
            className="mx-auto mt-8 max-w-3xl text-start"
          >
            <LinkInput />
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-white/50">
              <span className="chip">✅ {t("hero.badge1")}</span>
              <span className="chip">⚡ {t("hero.badge2")}</span>
              <span className="chip">🔒 {t("hero.badge3")}</span>
            </div>
          </motion.div>

          {/* إحصائيات */}
          <Stagger className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-3" step={0.07}>
            <Stat label={t("stats.downloads")} value={48} suffix="M+" />
            <Stat label={t("stats.sites")} value={1000} suffix="+" />
            <Stat label={t("stats.rating")} value={4.9} suffix="★" decimals={1} />
          </Stagger>
        </section>

        {/* ── المنصات ── */}
        <section className="py-10">
          <Reveal>
            <h2 className="text-center text-2xl font-black">{t("platforms.title")}</h2>
          </Reveal>
          <Stagger className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7" step={0.035} amount={0.1}>
            {platforms.map((p) => (
              <StaggerItem key={p.name} y={8} className="card !p-3 text-center transition-all hover:border-emerald/50 hover:shadow-glow">
                <div className="text-2xl">{p.icon}</div>
                <div className="mt-1 text-xs font-bold">{p.name}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ── كيف يعمل ── */}
        <section className="py-10">
          <Reveal><h2 className="text-center text-2xl font-black">{t("how.title")}</h2></Reveal>
          <Stagger className="mt-6 grid gap-3 md:grid-cols-3" step={0.08}>
            {steps.map(([icon, title, desc]) => (
              <StaggerItem key={title} y={10} className="card h-full">
                <div className="text-3xl">{icon}</div>
                <h3 className="mt-2 font-black">{title}</h3>
                <p className="mt-1 text-sm text-white/55">{desc}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ── الميزات ── */}
        <section className="py-10">
          <Reveal>
            <h2 className="text-center text-2xl font-black">{t("features.title")}</h2>
            <p className="mt-2 text-center text-sm text-white/55">{t("features.subtitle")}</p>
          </Reveal>
          <Stagger className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" step={0.05}>
            {features.map(([icon, title, desc]) => (
              <motion.div
                key={title}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
                }}
                whileHover={{ y: -3 }}
                className="card h-full"
              >
                <div className="text-3xl">{icon}</div>
                <h3 className="mt-2 font-black">{title}</h3>
                <p className="mt-1 text-sm text-white/55">{desc}</p>
              </motion.div>
            ))}
          </Stagger>
        </section>

        {/* ── CTA ── */}
        <Reveal>
          <section className="card my-10 !border-emerald/30 bg-card-gradient p-8 text-center">
            <h2 className="text-2xl font-black">🚀 {t("cta.title")}</h2>
            <p className="mt-2 text-sm text-white/60">{t("cta.subtitle")}</p>
            <div className="mx-auto mt-5 max-w-2xl"><LinkInput compact /></div>
          </section>
        </Reveal>

        <section className="py-10">
          <Reveal><h2 className="text-center text-2xl font-black">{t("faq.title")}</h2></Reveal>
          <Stagger className="mx-auto mt-6 max-w-3xl space-y-2" step={0.045}>
            {faqs.map(([q, a]) => (
              <StaggerItem key={q} y={8}>
                <details className="card !p-4">
                  <summary className="cursor-pointer font-bold">{q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{a}</p>
                </details>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* Breadcrumbs SEO */}
        <nav className="pb-6 text-xs text-white/35" aria-label="breadcrumb">
          🏠 {t("nav.home")} / ⬇️ {t("nav.download")} / ✨ {t("nav.features")}
        </nav>
      </main>
      <Footer />
    </>
  );
}
