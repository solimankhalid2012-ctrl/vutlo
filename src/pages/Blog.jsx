import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { POSTS } from "../data/posts.js";

/** المدونة — مقالات SEO حقيقية */
export default function Blog() {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <>
      <Helmet>
        <title>{ar ? "المدونة" : "Blog"} — Vutlo</title>
        <meta name="description" content={ar ? "شروحات التحميل والجودة والقانون — مقالات عملية." : "Download guides, quality tips and legal explainers."} />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-center text-3xl font-black">📝 {ar ? "المدونة" : "Blog"}</h1>
        <p className="mt-2 text-center text-sm text-white/55">{POSTS.length} {ar ? "مقالات عملية" : "practical guides"}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {POSTS.map((p) => {
            const c = p[lang] || p.en;
            return (
              <Link key={p.slug} to={`/blog/${p.slug}`} className="card transition-all hover:-translate-y-1 hover:border-emerald/50">
                <div className="text-4xl">{p.icon}</div>
                <h2 className="mt-2 font-black leading-snug">{c.title}</h2>
                <p className="mt-1 text-sm text-white/55">{c.excerpt}</p>
                <span className="mt-3 inline-block text-xs font-bold text-emerald" dir="ltr">{p.date} →</span>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
