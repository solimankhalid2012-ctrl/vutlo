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
        {/* 🎨 تغيير الألوان فقط: البنية والحقول كما هي */}
        <form onSubmit={submit} className="card border-emerald/25 p-7 shadow-[0_10px_40px_rgba(29,185,84,0.12)]">
          <h1 className="text-center text-2xl font-black text-on-accent">
            <span className="mr-1.5 inline-block rounded-xl bg-emerald/15 px-2 py-0.5 text-emerald-dark">👋</span>
            <span className="bg-gradient-to-r from-emerald via-emerald-dark to-emerald bg-clip-text text-transparent">
              {ar ? "مرحباً بعودتك" : "Welcome back"}
            </span>
          </h1>
          <p className="mt-1 text-center text-xs font-bold text-emerald/80">
            {ar ? "سجّل دخولك وتابع التحميلات" : "Sign in and keep downloading"}
          </p>

          <label className="mt-5 block text-xs font-black text-emerald/90" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            dir="ltr"
            autoComplete="email"
            className="input-smart mt-1.5 text-left placeholder:text-emerald/50 focus:border-emerald focus:bg-emerald/5"
          />

          <label className="mt-3 block text-xs font-black text-emerald/90" htmlFor="login-pass">
            {ar ? "كلمة المرور" : "Password"}
          </label>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={ar ? "••••••••" : "••••••••"}
            dir="ltr"
            autoComplete="current-password"
            className="input-smart mt-1.5 text-left placeholder:text-emerald/50 focus:border-emerald focus:bg-emerald/5"
          />

          {error && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
              ⚠️ {error}
            </p>
          )}

          <button disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? "⏳" : ar ? "تسجيل الدخول" : "Login"}
          </button>

          <p className="mt-3 text-center text-sm text-white/55">
            {ar ? "جديد هنا؟" : "New here?"}{" "}
            <Link to="/register" className="font-bold text-emerald underline-offset-4 hover:underline">
              {ar ? "أنشئ حساباً (+50 نقطة)" : "Create account (+50 pts)"}
            </Link>
          </p>
        </form>
      </main>
      <Footer />
    </>
  );
}
