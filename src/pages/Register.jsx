import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import MonkeyAvatar, { MonkeyHands } from "../components/auth/MonkeyAvatar.jsx";
import { useLang } from "../context/LangContext.jsx";
import { register, saveSession, isLoggedIn, AGE_MIN, AGE_MAX } from "../services/authApi.js";

/** إنشاء حساب — يمنح 50 نقطة ترحيبية.
 *  البنية مثبّتة على تصميم .monkey-card (loginCard.css) وبنفس ترتيب العناصر
 *  الذي تعتمد عليه المحدِّدات الشقيقة: blind-check ⇒ label.blind_input ⇒
 *  form ⇒ label.avatar. القرد يغمض عينيه ما دامت كلمة المرور مخفية. */
export default function Register() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blind, setBlind] = useState(true);

  if (isLoggedIn()) return <Navigate to="/" replace />;

  const ageNum = Number(age);
  // ⚠️ كسر مثل 27.5 ليس عمراً: كنّا نقرّبه في المتصفح (Math.round ⇒ 28)
  // فيُحفظ عمر لم يكتبه المستخدم. الآن نرفضه في الواجهة والخادم يرفضه أيضاً.
  const ageBad = age !== "" && (!Number.isInteger(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX);

  const submit = async (e) => {
    e.preventDefault();
    if (!Number.isInteger(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
      setError(ar ? `العمر مطلوب بالسنوات الكاملة (${AGE_MIN}–${AGE_MAX})` : `Age is required as whole years (${AGE_MIN}-${AGE_MAX})`);
      return;
    }
    setBusy(true); setError("");
    try {
      const r = await register(email.trim(), password, lang, ageNum);
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
      <Helmet><title>{ar ? "إنشاء حساب" : "Register"} — Vutlo</title></Helmet>
      <Header />
      <main className="flex flex-col items-center gap-4 px-4 py-14">
        <div className="monkey-card">
          <input
            className="blind-check"
            type="checkbox"
            id="blind-input-reg"
            name="blindcheck"
            checked={blind}
            onChange={(e) => setBlind(e.target.checked)}
            hidden
          />

          <label htmlFor="blind-input-reg" className="blind_input">
            <span className="hide">{ar ? "إخفاء" : "Hide"}</span>
            <span className="show">{ar ? "إظهار" : "Show"}</span>
          </label>

          <form className="form" onSubmit={submit} dir="ltr">
            <h1 className="title">{ar ? "إنشاء حساب" : "Create account"}</h1>

            <label className="label_input" htmlFor="email-reg">Email</label>
            <input
              spellCheck="false"
              className="input"
              type="email"
              name="email"
              id="email-reg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />

            <label className="label_input" htmlFor="age-reg">
              {ar ? `العمر (${AGE_MIN}–${AGE_MAX})` : `Age (${AGE_MIN}-${AGE_MAX})`}
            </label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              name="age"
              id="age-reg"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              placeholder="18"
              aria-invalid={ageBad || undefined}
              style={ageBad ? { borderColor: "#f87171" } : undefined}
              required
            />

            <label className="label_input" htmlFor="password-reg">
              {ar ? "كلمة المرور (8+ أحرف)" : "Password (8+ chars)"}
            </label>
            <input
              spellCheck="false"
              className="input"
              type={blind ? "password" : "text"}
              name="password"
              id="password-reg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            <button className="submit" type="submit" disabled={busy || ageBad}>
              {busy ? "⏳" : ar ? "إنشاء الحساب" : "Create account"}
            </button>

            <p style={{ color: "#8fe3b8", fontSize: "0.75rem", margin: "0.4rem 0 0", textAlign: "center" }}>
              {ar ? "+50 نقطة ترحيبية" : "+50 welcome points"}
            </p>
            {/* ⚠️ كان مكتوباً "4+ أحرف" والخادم يرفض أقل من 8 ويصدّ القوائم
                الشائعة ⇒ رسالة "كلمة السر 8 أحرف على الأقل" بعد submitting كامل. */}
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.68rem", margin: "0.25rem 0 0", textAlign: "center" }}>
              {ar
                ? "ثمانية أحرف على الأقل، وتجنّب الكلمات الشائعة مثل 12345678"
                : "At least eight characters, and avoid common ones like 12345678"}
            </p>
          </form>

          <label htmlFor="blind-input-reg" className="avatar">
            <MonkeyAvatar />
            <MonkeyHands />
          </label>
        </div>

        {/* ⚠️ خارج البطاقة: عنصر داخلها يحرّك شريط الإظهار المثبّت على حافتها السفلى */}
        <div className="w-full max-w-[380px]">
          {error && <p className="login-error">⚠️ {error}</p>}
          <p className="login-alt">
            {ar ? "لديك حساب؟" : "Have an account?"}{" "}
            <Link to="/login">{ar ? "تسجيل الدخول" : "Login"}</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
