import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { scheduleDownload, getSchedules, cancelSchedule } from "../../services/api.js";
import { useAdvOptions } from "../../hooks/useAdvOptions.js";

/**
 * ScheduleBox — الجدولة: يحفظ رابطاً ووقتاً محددين، ثم يعرض المهام ويتيح إلغائها.
 * يستخدم نفس vv-adv المستخدم في التحميل الفوري (جودة/صيغة/خيارات متقدمة).
 */
export default function ScheduleBox({ initialUrl = "" }) {
  const { t, lang } = useLang();
  const { adv } = useAdvOptions();
  const [url, setUrl] = useState(initialUrl);
  const [runAt, setRunAt] = useState("");
  const [quality, setQuality] = useState("1080p");
  const [format, setFormat] = useState("mp4");
  const [scheds, setScheds] = useState([]);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try { setScheds(await getSchedules()); } catch {}
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (initialUrl) setUrl(initialUrl); }, [initialUrl]);

  const save = async () => {
    if (!url.trim() || !runAt) return;
    try {
      await scheduleDownload({ url: url.trim(), runAt: new Date(runAt).toISOString(), quality, format, ...adv });
      setMsg("✅ " + t("sched.ok"));
      setUrl(""); setRunAt("");
      refresh();
    } catch (e) {
      setMsg("⚠️ " + e.message);
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const doCancel = async (id) => {
    try { await cancelSchedule(id); refresh(); } catch {}
  };

  return (
    <div className="card mt-3">
      <h2 className="font-black">⏰ {t("sched.title")}</h2>
      <p className="mt-1 text-sm text-white/55">{t("sched.subtitle")}</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="Video URL…" className="input-smart flex-1 text-left"
        />
        <input
          type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)}
          className="input-smart sm:w-56" title={t("sched.when")}
        />
        <button onClick={save} disabled={!url.trim() || !runAt} className="btn-primary sm:flex-none">{t("sched.save")}</button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select value={quality} onChange={(e) => setQuality(e.target.value)} className="input-smart">
          {["720p", "1080p", "1440p", "2160p (4K)", "4320p (8K)"].map((q) => (
            <option key={q} value={q} className="bg-void-800">{q}</option>
          ))}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)} className="input-smart">
          {["mp4", "mp3", "webm", "mkv", "gif"].map((f) => (
            <option key={f} value={f} className="bg-void-800">{f.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {msg && <p className="mt-2 text-sm text-mint">{msg}</p>}

      <div className="mt-3 space-y-1.5">
        {scheds.length === 0 && <p className="text-xs text-white/35">{t("sched.empty")}</p>}
        <AnimatePresence initial={false}>
          {scheds.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className={`chip ${s.status === "pending" ? "" : "!border-white/20 !bg-white/5 !text-white/50"}`}>{s.status}</span>
              <span className="min-w-0 flex-1 truncate" dir="ltr">{s.url}</span>
              <span className="shrink-0 text-xs text-white/40">{new Date(s.runAt).toLocaleString(lang)}</span>
              {s.status === "pending" && (
                <button onClick={() => doCancel(s.id)} className="shrink-0 text-xs text-red-300 hover:text-red-200">{t("history.delete")}</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
