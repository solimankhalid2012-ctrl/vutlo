import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPlaylist, startDownload, getJob } from "../../services/api.js";
import { useLang } from "../../context/LangContext.jsx";
import { useAdvOptions } from "../../hooks/useAdvOptions.js";
import { QUALITIES, FORMATS } from "../../utils/detectors.js";

/** أقصى مدة ننتظرها مهمة واحدة قبل اعتبارها عالقة */
const JOB_POLL_TIMEOUT = 30 * 60 * 1000;

/**
 * PlaylistDownloader — تحميل قوائم التشغيل والقنوات كاملة
 * - يحلل الرابط عبر POST /api/playlist (yt-dlp flat-playlist)
 * - يعرض الفيديوهات مع تحديد الكل/إلغاء + تحميل الكل بالتتابع
 * - تقدّم حي لكل عنصر عبر GET /api/job/:id
 */
export default function PlaylistDownloader() {
  const { t } = useLang();
  const { adv } = useAdvOptions();
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState("1080p");
  const [format, setFormat] = useState("mp4");
  const [loading, setLoading] = useState(false);
  const [pl, setPl] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [states, setStates] = useState({}); // index -> {status, progress, jobId}
  const [error, setError] = useState("");
  const [bulk, setBulk] = useState(false);

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(""); setPl(null); setStates({});
    try {
      const data = await fetchPlaylist(url.trim());
      setPl(data);
      setSelected(new Set(data.entries.map((_, i) => i)));
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const toggle = (i) => {
    setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const toggleAll = () => {
    if (!pl) return;
    setSelected((s) => (s.size === pl.entries.length ? new Set() : new Set(pl.entries.map((_, i) => i))));
  };

  const pollJob = (jobId, i) => new Promise((resolve) => {
    // مهلة قصوى: بدونها يبقى المؤقّت معلّقاً إلى الأبد إذا تعلّقت المهمة،
    // فيتوقف تحميل "الكل" عند أول عنصر عالق.
    const started = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - started > JOB_POLL_TIMEOUT) {
        clearInterval(id);
        resolve({ status: "error", error: "انتهت المهلة — تحقق من حالة المهمة" });
        return;
      }
      try {
        const j = await getJob(jobId);
        setStates((s) => ({ ...s, [i]: { status: j.status, progress: j.progress || 0, jobId } }));
        if (j.status === "done" || j.status === "error") { clearInterval(id); resolve(j); }
      } catch { clearInterval(id); resolve({ status: "error" }); }
    }, 1500);
  });

  const downloadAll = async () => {
    if (!pl || bulk) return;
    setBulk(true);
    for (const i of [...selected].sort((a, b) => a - b)) {
      const v = pl.entries[i];
      if (!v?.url) continue;
      try {
        setStates((s) => ({ ...s, [i]: { status: "downloading", progress: 0 } }));
        const res = await startDownload(v.url, { quality, format, extra: adv });
        if (res?.jobId) await pollJob(res.jobId, i);
        else setStates((s) => ({ ...s, [i]: { status: "done", progress: 100 } }));
      } catch {
        setStates((s) => ({ ...s, [i]: { status: "error", progress: 0 } }));
      }
    }
    setBulk(false);
  };

  return (
    <div className="card !p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="Playlist / Channel URL…"
          className="input-smart flex-1 text-left"
        />
        <button onClick={analyze} disabled={!url.trim() || loading} className="btn-primary sm:flex-none">
          {loading ? "⏳…" : "📃 " + t("hero.fetchBtn")}
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-bold text-white/50">
          {t("preview.quality")}
          <select value={quality} onChange={(e) => setQuality(e.target.value)} className="input-smart mt-1">
            {QUALITIES.map((q) => <option key={q} value={q} className="bg-void-800">{q}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold text-white/50">
          {t("preview.format")}
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="input-smart mt-1">
            {FORMATS.map((f) => <option key={f.id} value={f.id} className="bg-void-800">{f.id.toUpperCase()}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">⚠️ {error}</div>}

      <AnimatePresence>
        {pl && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black">📃 {pl.title} — {pl.count} {t("playlist.videos")}</h3>
              <div className="flex items-center gap-2">
                <button onClick={toggleAll} className="btn-ghost !py-2 text-xs">
                  {selected.size === pl.entries.length ? t("playlist.none") : t("playlist.all")}
                </button>
                <button onClick={downloadAll} disabled={bulk || selected.size === 0} className="btn-primary !py-2 text-sm">
                  {bulk ? "⏳…" : `⬇️ ${t("preview.downloadBtn")} (${selected.size})`}
                </button>
              </div>
            </div>
            <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pe-1">
              {pl.entries.map((v, i) => {
                const st = states[i];
                return (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="h-4 w-4 shrink-0 accent-[#0DBE68]" />
                    <span className="w-8 shrink-0 text-xs text-white/40">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{v.title}</span>
                    {st ? (
                      <span className={`shrink-0 text-xs font-bold ${st.status === "done" ? "text-emerald" : st.status === "error" ? "text-red-400" : "text-mint"}`}>
                        {st.status === "done" ? "✅" : st.status === "error" ? "❌" : `${Math.round(st.progress || 0)}%`}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-white/30">·</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
