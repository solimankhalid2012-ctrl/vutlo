import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../layouts/AdminLayout.jsx";
import { useLang } from "../../context/LangContext.jsx";
import { adminUsers, adminCreateUser, adminDeleteUser, adminSetPlan, isAdmin, adminLogout } from "../../services/adminApi.js";

/** إدارة المستخدمين — عرض + إضافة + حذف + تبديل الخطة (مجاني / Pro) */
export default function AdminUsers() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");

  const load = () => adminUsers().then(setUsers).catch((e) => {
    if (e.status === 401) { adminLogout(); nav("/admin/login"); }
    else setError(e.message);
  });
  useEffect(() => { if (!isAdmin()) nav("/admin/login"); else load(); }, [nav]);

  const add = async (e) => {
    e.preventDefault(); setError("");
    // ⚠️ كان الحقل يقبل أي نص ويخطئ فقط عند الإرسال؛ تحقّق مبكّر أوضح للمستخدم
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(ar ? "بريد غير صالح" : "Invalid email"); return; }
    if (password.length < 4) { setError(ar ? "كلمة السر 4 أحرف على الأقل" : "Password needs 4+ chars"); return; }
    try { await adminCreateUser({ email: email.trim(), password, role }); setEmail(""); setPassword(""); load(); }
    catch (err) { setError(err.message); }
  };
  const del = async (id, who) => {
    // ⚠️ كان الحذف بضغطة واحدة بلا تأكيد ⇒ ضغطة على زر في القائمة تحذف حساباً نهائياً
    if (!window.confirm(`${ar ? "حذف المستخدم" : "Delete user"} ${who}?\n${ar ? "لا يمكن التراجع." : "This cannot be undone."}`)) return;
    try { await adminDeleteUser(id); load(); } catch (err) { setError(err.message); }
  };
  const togglePlan = async (u) => {
    const next = u.plan === "pro" ? "free" : "pro";
    if (next === "pro" && !window.confirm(`${ar ? "منح" : "Grant"} Pro ${ar ? "إلى" : "to"} ${u.email}?`)) return;
    try { await adminSetPlan(u.id, next); load(); }
    catch (err) { setError(err.message); }
  };

  return (
    <>
      <Helmet><title>Admin Users — Vutlo</title></Helmet>
      <AdminLayout>
        <h1 className="text-2xl font-black">👥 {ar ? "المستخدمون" : "Users"} ({users.length})</h1>
        <form onSubmit={add} className="card mt-4 flex flex-col gap-2 sm:flex-row">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" dir="ltr" type="email" autoComplete="off" className="input-smart flex-1 text-left" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" dir="ltr" type="password" autoComplete="new-password" className="input-smart flex-1 text-left" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-2xl border border-white/15 bg-void-800 px-3 py-3 text-sm font-bold">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="btn-primary sm:flex-none">➕ {ar ? "إضافة" : "Add"}</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-300">⚠️ {error}</p>}
        <div className="mt-4 space-y-1.5">
          {users.map((u) => (
            <div key={u.id} className="card !p-3 flex items-center gap-3 text-sm">
              <span className="font-bold" dir="ltr">{u.email}</span>
              <span className="chip">{u.role}</span>
              <button
                onClick={() => togglePlan(u)}
                title={ar ? "تبديل الخطة" : "Toggle plan"}
                className={`chip !text-[11px] transition-colors ${u.plan === "pro" ? "!border-emerald !text-emerald" : "!border-white/20 !text-white/50"}`}
              >
                {u.plan === "pro" ? "💎 Pro" : "🆓 Free"}
              </button>
              <span className="text-xs text-white/40">🏆 {u.points}</span>
              <button onClick={() => del(u.id, u.email)} className="ms-auto text-xs text-red-300 hover:text-red-200">{ar ? "حذف" : "Delete"}</button>
            </div>
          ))}
        </div>
      </AdminLayout>
    </>
  );
}
