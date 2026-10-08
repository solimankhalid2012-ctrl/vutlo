import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../layouts/AdminLayout.jsx";
import { useLang } from "../../context/LangContext.jsx";
import { adminStats, isAdmin, adminLogout } from "../../services/adminApi.js";

/** اللوحة الرئيسية — إحصائيات حية + المهام النشطة + الأحدث */
export default function AdminDashboard() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  // قيم افتراضية حتى لا تنهار الصفحة لو نقص حقل من رد الخادم
  const normalize = (raw) => {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      ...r,
      // ⚠️ "ads" لا يرسله /api/admin/stats إطلاقاً ⇒ بطاقة "خانات إعلانية"
      // كانت تعرض 0 دائماً كأنها بيانات حقيقية. نُسقطها.
      totals: { downloads: 0, previews: 0, users: 0, ...(r.totals || {}) },
      jobs: {
        done: 0,
        error: 0,
        ...(r.jobs || {}),
        active: Array.isArray(r.jobs?.active) ? r.jobs.active : [],
      },
      schedulesPending: r.schedulesPending ?? 0,
      mode: r.mode ?? "—",
    };
  };

  useEffect(() => {
    if (!isAdmin()) { nav("/admin/login"); return; }
    let alive = true;
    const load = () =>
      adminStats()
        .then((d) => { if (alive) setStats(normalize(d)); })
        .catch((e) => {
          if (!alive) return;
          if (e.status === 401) { adminLogout(); nav("/admin/login"); return; }
          setError(e.message);
        });
    load();
    // ⚠️ كان كل 5s حتى وهو مخفي ⇒ طلبات لا فائدة منها على التبويب الخلفي
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [nav]);

  if (error) return <AdminLayout><p className="text-red-300">⚠️ {error}</p></AdminLayout>;
  if (!stats) return <AdminLayout><p className="text-white/50">⏳…</p></AdminLayout>;

  const cards = [
    ["⬇️", ar ? "تحميلات" : "Downloads", stats.totals.downloads],
    ["👁️", ar ? "معاينات" : "Previews", stats.totals.previews],
    ["👥", ar ? "مستخدمون" : "Users", stats.totals.users],
    ["✅", ar ? "مهام ناجحة" : "Jobs done", stats.jobs.done],
    ["❌", ar ? "مهام فاشلة" : "Jobs failed", stats.jobs.error],
    ["⏰", ar ? "مجدولة" : "Scheduled", stats.schedulesPending],
    ["💾", "DB", stats.mode],
  ];

  return (
    <>
      <Helmet><title>Admin Dashboard — Vutlo</title></Helmet>
      <AdminLayout>
        <h1 className="text-2xl font-black">📊 {ar ? "لوحة التحكم" : "Dashboard"}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(([icon, label, v]) => (
            <div key={label} className="card !p-4">
              <div className="text-xl">{icon}</div>
              <div className="mt-1 text-2xl font-black text-emerald">{v}</div>
              <div className="text-xs text-white/55">{label}</div>
            </div>
          ))}
        </div>
        <h2 className="mt-6 font-black">⚙️ {ar ? "مهام نشطة" : "Active jobs"} ({stats.jobs.active.length})</h2>
        <div className="mt-2 space-y-1.5">
          {stats.jobs.active.length === 0 && <p className="text-sm text-white/40">—</p>}
          {stats.jobs.active.map((j) => (
            <div key={j.jobId} className="card !p-3">
              <div className="flex justify-between text-xs">
                <span className="truncate font-bold" dir="ltr">{j.url}</span>
                <span className="text-mint">{Math.round(j.progress || 0)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-emerald transition-all" style={{ width: `${j.progress || 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </AdminLayout>
    </>
  );
}
