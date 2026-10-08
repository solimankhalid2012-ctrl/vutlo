import React, { useMemo } from "react";
import { useLang } from "../../context/LangContext.jsx";
import {
  GIF_DEFAULT, GIF_WIDTHS, GIF_FPS, GIF_SPEEDS, GIF_DITHERERS, GIF_PRESETS, gifNumber,
} from "../../utils/tools.js";

/**
 * GifOptions — كل خيارات تحويل الفيديو إلى GIF في لوحة واحدة.
 *
 * ⚠️ كانت three حقول فقط (من/مدة/عرض) والخادم يتجاهلها ويستخدم قيماً ثابتة
 * ⇒ المستخدم يغيّر الخيارات ولا يحدث شيء. الآن كل قيمة تُرسل مع الطلب
 * وتُقصّ في الخادم (clampGifArgs) وتنعكس على اسم ملف الناتج.
 *
 * الخيارات: البداية، المدة، العرض، الإطارات/ثانية، التدرّج (dither)،
 * عدد التكرارات، السرعة، + إعدادات جاهزة + تقدير الحجم.
 */
export default function GifOptions({ value, onChange, durationSec = 0, compact = false }) {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const opts = { ...GIF_DEFAULT, ...(value || {}) };
  const set = (patch) => onChange({ ...opts, ...patch });

  const total = Math.max(0, gifNumber(durationSec, 0));
  // نمنع تجاوز نهاية الفيديو: المدة = ما تبقّى من البداية
  const maxStart = total > 0 ? Math.max(0, Math.floor(total - 0.5)) : 6 * 3600;
  const start = Math.min(gifNumber(opts.start, 0), maxStart);
  const duration = Math.min(Math.max(gifNumber(opts.duration, 4), 1), 30);
  const frames = Math.max(1, Math.round(duration * gifNumber(opts.fps, 12)));
  const outSeconds = duration / Math.max(0.25, gifNumber(opts.speed, 1));
  // تقدير حجم تقريبي (عرض×ارتفاع×بت/إطار) — مؤشر للمستخدم لا ضمان
  const estMB = useMemo(() => {
    const px = gifNumber(opts.width, 480) * Math.round((gifNumber(opts.width, 480) * 9) / 16);
    const bitsPerFrame = gifNumber(opts.dither, "bayer") === "none" ? 0.07 : 0.11;
    return ((px * bitsPerFrame * frames) / 8 / 1024 / 1024).toFixed(1);
  }, [opts.width, opts.dither, frames]);

  const fmtTime = (s) => {
    const sec = Math.max(0, Math.round(gifNumber(s, 0)));
    const m = Math.floor(sec / 60);
    return `${m}:${String(sec % 60).padStart(2, "0")}`;
  };

  const trimLabel = total > 0
    ? `${fmtTime(start)} → ${fmtTime(start + duration)} ${ar ? `من ${fmtTime(total)}` : `of ${fmtTime(total)}`}`
    : (ar ? "مدة الفيديو غير معروفة" : "Video duration unknown");

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="gif-options">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-black text-white/60">
          🎞️ {t("tools.gifOpts") || (ar ? "خيارات الـGIF" : "GIF options")}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {GIF_PRESETS.map((p) => (
            <button
              type="button"
              key={p.id}
              onPointerDown={() => set(p.opts)}
              onClick={() => set(p.opts)}
              title={ar ? p.ar : p.en}
              className="select-none touch-manipulation rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/70 transition-colors duration-150 hover:border-emerald/40 hover:text-white"
            >
              {ar ? p.ar : p.en}
            </button>
          ))}
          <button
            type="button"
            onPointerDown={() => onChange({ ...GIF_DEFAULT })}
            onClick={() => onChange({ ...GIF_DEFAULT })}
            className="select-none touch-manipulation rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/50 transition-colors duration-150 hover:text-white"
          >
            ↺ {ar ? "افتراضي" : "Reset"}
          </button>
        </div>
      </div>

      {/* شريط تحديد المقطع: يوضّح أين يقع القص داخل الفيديو */}
      <div className="mb-3">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 rounded-full bg-emerald/70"
            style={{
              left: `${total > 0 ? Math.min(100, (start / total) * 100) : 0}%`,
              width: `${total > 0 ? Math.min(100 - Math.min(100, (start / total) * 100), (duration / total) * 100) : 25}%`,
            }}
          />
        </div>
        <p className="mt-1 text-[11px] font-bold text-white/45">
          ✂️ {trimLabel} · {frames} {ar ? "إطار" : "frames"} · ≈{estMB} MB
          {outSeconds !== duration && ` · ${ar ? "بعد السرعة" : "after speed"} ${outSeconds.toFixed(1)}s`}
        </p>
      </div>

      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        <label className="text-[11px] font-bold text-white/50">
          {ar ? "من (ثانية)" : "Start (sec)"}
          <input
            type="number"
            min="0"
            max={maxStart}
            step="0.5"
            value={start}
            onChange={(e) => set({ start: gifNumber(e.target.value, 0) })}
            className="input-smart mt-1 !py-2"
          />
        </label>
        <label className="text-[11px] font-bold text-white/50">
          {ar ? "المدة (ثانية)" : "Duration (sec)"}
          <input
            type="number"
            min="1"
            max="30"
            step="0.5"
            value={duration}
            onChange={(e) => set({ duration: gifNumber(e.target.value, 4) })}
            className="input-smart mt-1 !py-2"
          />
        </label>

        {/* العرض: أزرار اختيار (ضغطة واحدة) + رقم حر */}
        <div className="text-[11px] font-bold text-white/50">
          {ar ? "العرض (px)" : "Width (px)"}
          <div className="mt-1 flex flex-wrap gap-1">
            {GIF_WIDTHS.map((w) => (
              <button
                type="button"
                key={w}
                onPointerDown={() => set({ width: w })}
                onClick={() => set({ width: w })}
                aria-pressed={gifNumber(opts.width, 480) === w}
                className={`select-none touch-manipulation rounded-lg px-2 py-1.5 text-[11px] font-black transition-colors duration-150 ${
                  gifNumber(opts.width, 480) === w
                    ? "bg-emerald text-on-accent"
                    : "border border-white/10 bg-white/5 text-white/70 hover:border-emerald/40"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <label className="text-[11px] font-bold text-white/50">
          {ar ? "السرعة" : "Speed"}
          <select
            className="input-smart mt-1 !py-2"
            value={String(opts.speed ?? 1)}
            onChange={(e) => set({ speed: gifNumber(e.target.value, 1) })}
          >
            {GIF_SPEEDS.map((s) => (
              <option key={s} value={String(s)} className="bg-void-200">
                {s === 1 ? (ar ? "عادية 1×" : "Normal 1×") : `${s}×`}
              </option>
            ))}
          </select>
        </label>

        <div className="text-[11px] font-bold text-white/50">
          {ar ? "الإطارات/ثانية" : "Frames/sec (fps)"}
          <div className="mt-1 flex flex-wrap gap-1">
            {GIF_FPS.map((f) => (
              <button
                type="button"
                key={f}
                onPointerDown={() => set({ fps: f })}
                onClick={() => set({ fps: f })}
                aria-pressed={gifNumber(opts.fps, 12) === f}
                className={`select-none touch-manipulation rounded-lg px-2 py-1.5 text-[11px] font-black transition-colors duration-150 ${
                  gifNumber(opts.fps, 12) === f
                    ? "bg-mint text-on-accent"
                    : "border border-white/10 bg-white/5 text-white/70 hover:border-emerald/40"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <label className="text-[11px] font-bold text-white/50">
          {ar ? "التدرّج اللوني" : "Dithering"}
          <select
            className="input-smart mt-1 !py-2"
            value={`${opts.dither || "bayer"}:${opts.bayerScale ?? 2}`}
            onChange={(e) => {
              const [d, s] = String(e.target.value).split(":");
              set({ dither: d, bayerScale: Number(s) || 2 });
            }}
          >
            {GIF_DITHERERS.map((d) => {
              const key = `${d.id}:${d.scale ?? 2}`;
              return (
                <option key={key} value={key} className="bg-void-200">{ar ? d.ar : d.en}</option>
              );
            })}
          </select>
        </label>

        <label className="text-[11px] font-bold text-white/50">
          {ar ? "التكرار" : "Loops"}
          <select
            className="input-smart mt-1 !py-2"
            value={String(gifNumber(opts.loop, 0))}
            onChange={(e) => set({ loop: gifNumber(e.target.value, 0) })}
          >
            <option value="0" className="bg-void-200">{ar ? "بلا نهاية ∞" : "Forever ∞"}</option>
            {[1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={String(n)} className="bg-void-200">{n}×</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/40">
        {ar
          ? "يُنزَّل مقطع ≤480p ثم يحوّله FFmpeg بلوحة ألوان محسّنة. كلما زاد العرض والإطارات زاد الحجم وزاد الوقت."
          : "A ≤480p copy is downloaded, then FFmpeg builds the GIF with an optimised palette. Bigger width/fps ⇒ larger file, longer render."}
      </p>
    </div>
  );
}
