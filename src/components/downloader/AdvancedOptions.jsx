import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { useAdvOptions } from "../../hooks/useAdvOptions.js";

/**
 * AdvancedOptions — لوحة واحدة تجمع القص + الترجمة + كلمة السر + الخيوط.
 * تُستخدم في الرئيسية (ضمن الأداة الموحدة) وفي صفحة /download بلا تكرار.
 */
export default function AdvancedOptions({ compact = false, defaultOpen = false }) {
  const { t } = useLang();
  const { adv, set, saved, hasTrim } = useAdvOptions();
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="card mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-start"
        aria-expanded={open}
      >
        <span className="font-black">⚙️ {t("download.advTitle")}</span>
        <span className="flex items-center gap-2 text-xs font-bold text-white/45">
          {saved && <span className="chip">✅ {t("download.saved")}</span>}
          {hasTrim() && <span className="chip">✂️</span>}
          {adv.subs && <span className="chip">💬</span>}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <label className="block text-sm font-bold text-white/70">{t("download.pw")}</label>
              <input
                type="password" value={adv.password} onChange={set("password")}
                placeholder={t("download.pwPh")} className="input-smart mt-1.5" autoComplete="off"
              />

              <label className="mt-4 block text-sm font-bold text-white/70">
                ✂️ {t("download.trim")} <span className="text-xs font-normal text-white/40">— {t("download.trimHint")}</span>
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <input type="number" min="0" value={adv.trimStart} onChange={set("trimStart")} placeholder={t("download.start")} className="input-smart" />
                <input type="number" min="0" value={adv.trimEnd} onChange={set("trimEnd")} placeholder={t("download.end")} className="input-smart" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold">
                  <input type="checkbox" checked={!!adv.subs} onChange={set("subs")} className="h-4 w-4 accent-[#0DBE68]" />
                  💬 {t("download.subs")}
                </label>
                <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold">
                  ⚡ {t("download.threads")}
                  <select value={adv.threads} onChange={set("threads")} className="ms-auto rounded-xl border border-white/15 bg-void-800 px-2 py-1">
                    {[1, 2, 4, 8, 12, 16].map((n) => (
                      <option key={n} value={n} className="bg-void-800">{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              {!compact && <p className="mt-3 text-xs text-white/45">{t("download.live")}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
