import React from "react";
import { FORMATS } from "../../utils/detectors.js";

/** FormatPicker — اختيار الصيغة MP4/MP3/WEBM/MKV/GIF */
export default function FormatPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FORMATS.map((f) => (
        <button
          key={f.id}
          title={f.desc}
          onClick={() => onChange(f.id)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            value === f.id ? "bg-mint text-on-accent" : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          {f.id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
