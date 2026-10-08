import React, { useId } from "react";

/** Premium Logo — Video + Vault shield with animated glow */
export function Logo({ size = 40, className = "", animated = false }) {
  // ⚠️ كان id="logoGrad" ثابتاً والشعار مكرّر (ترويسة + تذييل + Favicon)
  // ⇒ متصفّحات Chrome/Edge تربط كل copy بالمعرّف الأول ⇒ التدرّج يظهر في
  // نسخة واحدة فقط. useId يعطي معرّفاً فريداً لكل نسخة.
  const gradId = `logoGrad-${useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label="Vutlo"
      className={className}
      style={{ filter: animated ? "drop-shadow(0 0 8px #0DBE68)" : "none" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0DBE68" />
          <stop offset="100%" stopColor="#40EC8C" />
        </linearGradient>
      </defs>
      <path
        d="M24 3 6 10v12c0 10.5 7.5 18.4 18 23 10.5-4.6 18-12.5 18-23V10L24 3Z"
        fill={`url(#${gradId})`}
        opacity="0.12"
      />
      <path
        d="M24 3 6 10v12c0 10.5 7.5 18.4 18 23 10.5-4.6 18-12.5 18-23V10L24 3Z"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="15" y="18" width="18" height="13" rx="3.5" fill={`url(#${gradId})`} />
      <path d="M22 21.2v6.6l5.4-3.3-5.4-3.3Z" fill="#0A0E0A" />
      <circle cx="33" cy="15" r="2.4" fill="#9ADEC1" />
    </svg>
  );
}