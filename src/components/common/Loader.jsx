import React from "react";

/**
 * Loader — مؤشّر تحميل من 10 أشرطة (موازن صوتي مصغّر).
 *
 * ⚠️ كان هنا مستطيل واحد ينبض، وفي AppRoutes نسخة ثانية مكرّرة؛ صارا واحداً
 * هنا. الأشرطة تتدرّج في الارتفاع بتأخير متدرّج ⇒ إحساس أنيق بلا وميض.
 * يحترم prefers-reduced-motion عبر globals.css.
 */
export default function Loader({ label = "", full = true, size = 26 }) {
  const bars = (
    <span
      className="vv-bars"
      style={{ height: size, "--bar-h": `${size}px` }}
      role="status"
      aria-label={label || "جارٍ التحميل"}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </span>
  );

  if (!full) {
    return <span className="inline-flex items-center gap-2.5">{bars}{label && <span className="text-xs font-bold text-white/60">{label}</span>}</span>;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      {bars}
      {label && <p className="animate-fade-in text-sm font-bold tracking-wide text-white/50">{label}</p>}
    </div>
  );
}