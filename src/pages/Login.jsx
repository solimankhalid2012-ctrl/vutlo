import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import MonkeyAvatar, { MonkeyHands } from "../components/auth/MonkeyAvatar.jsx";
import { useLang } from "../context/LangContext.jsx";
import { loginUser, saveSession, isLoggedIn } from "../services/authApi.js";

/** تسجيل الدخول — يخزّن JWT ويحوّل إلى الرئيسية.
 *  البنية مثبّتة على تصميم .monkey-card (loginCard.css):
 *  blind-check 먼저 ⇒ ثم label.blind_input ⇒ ثم form ⇒ ثم label.avatar،
 *  لأن كل المؤثرات تعتمد على المحدِّدات الشقيقة (~) بهذا الترتيب. */
export default function Login() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // true = كلمة المرور مُخفية (القرد يغمض عينيه)، مطابقة لاسم blind-check
  const [blind, setBlind] = useState(true);

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
      <main className="flex flex-col items-center gap-4 px-4 py-14">
        <div className="monkey-card">
          <input
            className="blind-check"
            type="checkbox"
            id="blind-input"
            name="blindcheck"
            checked={blind}
            onChange={(e) => setBlind(e.target.checked)}
            hidden
          />

          <label htmlFor="blind-input" className="blind_input">
            <span className="hide">{ar ? "إخفاء" : "Hide"}</span>
            <span className="show">{ar ? "إظهار" : "Show"}</span>
          </label>

          <form className="form" onSubmit={submit} dir="ltr">
            <h1 className="title">{ar ? "تسجيل الدخول" : "Sign In"}</h1>

            <label className="label_input" htmlFor="email-input">Email</label>
            <input
              spellCheck="false"
              className="input"
              type="email"
              name="email"
              id="email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <div className="frg_pss">
              <label className="label_input" htmlFor="password-input">
                {ar ? "كلمة المرور" : "Password"}
              </label>
              <span className="forgot" title={ar ? "قريباً" : "Coming soon"}>
                {ar ? "نسيت كلمة المرور؟" : "Forgot password?"}
              </span>
            </div>
            <input
              spellCheck="false"
              className="input"
              /* الحقل المخفي type=password (آمن في كل المتصفحات)،
                 الظاهر type=text — والنقاط يضيفها -webkit-text-security */
              type={blind ? "password" : "text"}
              name="password"
              id="password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <button className="submit" type="submit" disabled={busy}>
              {busy ? "⏳" : ar ? "تسجيل الدخول" : "Submit"}
            </button>
          </form>

          <label htmlFor="blind-input" className="avatar">
            <MonkeyAvatar />
            <MonkeyHands />
          </label>
        </div>

        {/* ⚠️ خارج البطاقة عمداً: زر Show/Hide مربوط بحافة البطاقة
            السفلى بـbottom ثابت، وأي عنصر داخلها يحرّكه عن حقل كلمة المرور. */}
        <div className="w-full max-w-[380px]">
          {error && <p className="login-error">⚠️ {error}</p>}
          <p className="login-alt">
            {ar ? "جديد هنا؟" : "New here?"}{" "}
            <Link to="/register">
              {ar ? "أنشئ حساباً (+50 نقطة)" : "Create account (+50 pts)"}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
