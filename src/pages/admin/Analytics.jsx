import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../layouts/AdminLayout.jsx";
import { useLang } from "../../context/LangContext.jsx";
import { adminRecent, isAdmin, adminLogout } from "../../services/adminApi.js";

/** التحليلات — توزيع الصيغ + نشاط آخر 7 أيام (أعمدة CSS خالصة) */
export default function AdminAnalytics() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isAdmin()) { nav("/admin/login"); return; }
    // 500 ضمن حد السيرفر (1000)، وadminApi يحدّه أيضاً
    adminRecent(500).then(setRows).catch((e) => {
      if (e.status === 401) { adminLogout(); nav("/admin/login"); }
    });
  }, [nav]);

  const byFormat = {};
  rows.filter((r) => r.kind === "download").forEach((r) => { byFormat[r.format || "?"] = (byFormat[r.format || "?"] || 0) + 1; });
  const maxF = Math.max(1, ...Object.values(byFormat));

  // ⚠️ new Date(r.at).toISOString() كان يرمي RangeError: Invalid time value
  // وسطراً واحد ناقص ⇒ الصفحة كلها تسقط إن كان أي سجل بـat=null/NaN.
  const dayKey = (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const count = rows.filter((r) => dayKey(r.at) === key).length;
    return { key: key.slice(5), count };
  });
  const maxD = Math.max(1, ...days.map((d) => d.count));

  const Bar = ({ label, v, max }) => (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 font-bold" dir="ltr">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-lg bg-white/10">
        <div className="h-full rounded-lg bg-gradient-to-r from-emerald to-mint transition-all" style={{ width: `${(v / max) * 100}%` }} />
      </div>
      <span className="w-10 shrink-0 text-end font-black text-emerald">{v}</span>
    </div>
  );

  return (
    <>
      <Helmet><title>Admin Analytics — VideoVault Pro</title></Helmet>
      <AdminLayout>
        <h1 className="text-2xl font-black">📈 {ar ? "التحليلات" : "Analytics"}</h1>
        <div className="card mt-4">
          <h2 className="font-black">🎬 {ar ? "التحميلات حسب الصيغة" : "Downloads by format"}</h2>
          <div className="mt-3 space-y-2">
            {Object.keys(byFormat).length === 0 && <p className="text-sm text-white/40">—</p>}
            {Object.entries(byFormat).map(([f, v]) => <Bar key={f} label={f} v={v} max={maxF} />)}
          </div>
        </div>
        <div className="card mt-4">
          <h2 className="font-black">📅 {ar ? "النشاط — آخر 7 أيام" : "Activity — last 7 days"}</h2>
          <div className="mt-3 space-y-2">
            {days.map((d) => <Bar key={d.key} label={d.key} v={d.count} max={maxD} />)}
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
