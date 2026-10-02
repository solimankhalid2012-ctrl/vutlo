import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import LinkInput from "../components/downloader/LinkInput.jsx";
import { useLang } from "../context/LangContext.jsx";
import { POSTS } from "../data/posts.js";

/** صفحة مقال — SEO + breadcrumbs + مقالات ذات صلة */
export default function Post() {
  const { slug } = useParams();
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return <Navigate to="/blog" replace />;

  const c = post[lang] || post.en;
  const related = POSTS.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <>
      <Helmet>
        <title>{c.title} — VideoVault Pro</title>
        <meta name="description" content={c.excerpt} />
        <meta property="og:title" content={c.title} />
        <meta property="og:description" content={c.excerpt} />
        <meta property="article:published_time" content={post.date} />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="text-xs text-white/40">🏠 {t("nav.home")} / 📝 Blog / {c.title.slice(0, 30)}…</nav>
        <div className="mt-3 text-5xl">{post.icon}</div>
        <h1 className="mt-2 text-3xl font-black leading-tight">{c.title}</h1>
        <p className="mt-2 text-sm text-white/45" dir="ltr">{post.date} • VideoVault Pro</p>
        <article className="card mt-6 space-y-4 leading-loose text-white/80">
          {c.body.map((p, i) => <p key={i}>{p}</p>)}
        </article>
        <div className="card mt-6 !border-emerald/30">
          <h3 className="font-black">⚡ {ar ? "جرّب بنفسك الآن" : "Try it yourself now"}</h3>
          <div className="mt-3"><LinkInput compact /></div>
        </div>
        <h3 className="mt-8 font-black">📚 {ar ? "اقرأ أيضاً" : "Related"}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {related.map((r) => {
            const rc = r[lang] || r.en;
            return (
              <Link key={r.slug} to={`/blog/${r.slug}`} className="card !p-4 text-sm font-bold hover:border-emerald/50">
                <span className="text-2xl">{r.icon}</span>
                <span className="mt-1 block">{rc.title}</span>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
