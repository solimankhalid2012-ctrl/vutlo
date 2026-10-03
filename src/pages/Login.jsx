import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { loginUser, saveSession, isLoggedIn } from "../services/authApi.js";

/** تسجيل الدخول — يخزّن JWT ويحوّل إلى الرئيسية */
export default function Login() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoggedIn()) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await loginUser(email.trim(), password, lang);
      saveSession(r.token, r.user);
      nav("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Helmet><title>{ar ? "تسجيل الدخول" : "Login"} — VideoVault Pro</title></Helmet>
      <Header />
      <main className="mx-auto max-w-sm px-4 py-14">
        {/* تغيير الألوان فقط: البنية والحقول والنصوص كما هي */}
        <form onSubmit={submit} className="card border-emerald/25 p-7 shadow-[0_10px_40px_rgba(29,185,84,0.12)]">
          <h1 className="bg-gradient-to-r from-emerald via-emerald-dark to-emerald-dark bg-clip-text text-center text-2xl font-black text-transparent">{ar ? "مرحباً بعودتك" : "Welcome back"}</h1>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" dir="ltr" autoComplete="email" className="input-smart mt-4 text-left focus:border-emerald focus:bg-emerald/5" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={ar ? "كلمة المرور" : "Password"} dir="ltr" autoComplete="current-password" className="input-smart mt-2 text-left focus:border-emerald focus:bg-emerald/5" />
          {error && <p className="mt-2 text-sm font-bold text-red-400">⚠️ {error}</p>}
          <button disabled={busy} className="btn-primary mt-4 w-full">{busy ? "⏳" : ar ? "تسجيل الدخول" : "Login"}</button>
          <p className="mt-3 text-center text-sm text-white/55">
            {ar ? "جديد هنا؟" : "New here?"} <Link to="/register" className="font-bold text-emerald hover:underline">{ar ? "أنشئ حساباً (+50 نقطة)" : "Create account (+50 pts)"}</Link>
          </p>
        </form>
      </main>
      <Footer />
    </>
  );
}
