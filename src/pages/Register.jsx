import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { register, saveSession, isLoggedIn } from "../services/authApi.js";

/** إنشاء حساب — يمنح 50 نقطة ترحيبية */
export default function Register() {
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
      const r = await register(email.trim(), password, lang);
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
      <Helmet><title>{ar ? "إنشاء حساب" : "Register"} — VideoVault Pro</title></Helmet>
      <Header />
      <main className="mx-auto max-w-sm px-4 py-14">
        <form onSubmit={submit} className="card">
          <h1 className="text-center text-2xl font-black">✨ {ar ? "أنشئ حسابك +50 نقطة" : "Create account +50 pts"}</h1>
          <p className="mt-1 text-center text-xs text-white/50">{ar ? "+10 لكل تحميل و +1 لكل معاينة" : "+10 per download and +1 per preview"}</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" dir="ltr" autoComplete="email" className="input-smart mt-4 text-left" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={ar ? "كلمة المرور (4+ أحرف)" : "Password (4+ chars)"} dir="ltr" autoComplete="new-password" className="input-smart mt-2 text-left" />
          {error && <p className="mt-2 text-sm text-red-300">⚠️ {error}</p>}
          <button disabled={busy} className="btn-primary mt-4 w-full">{busy ? "⏳" : ar ? "إنشاء الحساب" : "Create account"}</button>
          <p className="mt-3 text-center text-sm text-white/55">
            {ar ? "لديك حساب؟" : "Have an account?"} <Link to="/login" className="font-bold text-emerald">{ar ? "تسجيل الدخول" : "Login"}</Link>
          </p>
        </form>
      </main>
      <Footer />
    </>
  );
}
