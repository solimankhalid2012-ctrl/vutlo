import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useLang } from "../../context/LangContext.jsx";
import { adminLogin, isAdmin } from "../../services/adminApi.js";

/** دخول المسؤول — JWT صالح 12 ساعة */
export default function AdminLogin() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAdmin()) return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await adminLogin(email.trim(), password);
      localStorage.setItem("vv-admin-token", r.token);
      nav("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Helmet><title>Admin Login — VideoVault Pro</title></Helmet>
      <div className="flex min-h-screen items-center justify-center px-4">
        <form onSubmit={submit} className="card w-full max-w-sm">
          <h1 className="text-center text-2xl font-black">🛡️ Admin</h1>
          <p className="mt-1 text-center text-xs text-white/45">JWT · 12h</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" dir="ltr" autoComplete="username" className="input-smart mt-4 text-left" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" dir="ltr" autoComplete="current-password" className="input-smart mt-2 text-left" />
          {error && <p className="mt-2 text-sm text-red-300">⚠️ {error}</p>}
          <button disabled={busy} className="btn-primary mt-4 w-full">{busy ? "⏳" : ar ? "دخول" : "Login"}</button>
        </form>
      </div>
    </>
  );
}
