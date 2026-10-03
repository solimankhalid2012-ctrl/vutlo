import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLang } from "../context/LangContext.jsx";
import { adminLogout } from "../services/adminApi.js";

/** تخطيط لوحة الإدارة — قائمة جانبية + خروج */
export default function AdminLayout({ children }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const loc = useLocation();
  const nav = useNavigate();

  const links = [
    ["📊", ar ? "اللوحة" : "Dashboard", "/admin"],
    ["👥", ar ? "المستخدمون" : "Users", "/admin/users"],
    ["📈", ar ? "التحليلات" : "Analytics", "/admin/analytics"],
    ["🏠", ar ? "الموقع" : "Site", "/"],
  ];

  const out = () => { adminLogout(); nav("/admin/login"); };

  return (
    <div className="min-h-screen bg-void">
      <aside className="fixed inset-y-0 start-0 z-40 w-60 border-e border-white/10 bg-black/40 p-4">
        <div className="mb-6 text-lg font-black">🛡️ Video<span className="text-emerald">Vault</span> Admin</div>
        <nav className="space-y-1">
          {links.map(([icon, label, to]) => (
            <Link
              key={to}
              to={to}
              className={`block rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                loc.pathname === to ? "bg-emerald text-on-accent" : "text-white/65 hover:bg-white/5"
              }`}
            >
              {icon} {label}
            </Link>
          ))}
        </nav>
        <button onClick={out} className="mt-6 w-full rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10">
          🚪 {ar ? "خروج" : "Logout"}
        </button>
      </aside>
      <main className="ps-64 p-6">{children}</main>
    </div>
  );
}
