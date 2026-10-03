import React from "react";
import { QUALITIES } from "../../utils/detectors.js";

/** QualitySelector — اختيار الجودة 144p → 8K (مستقل قابل لإعادة الاستخدام) */
export default function QualitySelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {QUALITIES.map((q) => (
        <button
          key={q}
          onClick={() => onChange(q)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            value === q ? "bg-emerald text-on-accent shadow-glow" : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
