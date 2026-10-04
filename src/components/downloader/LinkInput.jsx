import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  detectPlatform,
  guessThumbnail,
  supportsNoWatermark,
  suggestQuality,
  QUALITIES,
  FORMATS,
} from "../../utils/detectors.js";
import { toolById, formatForTool, GIF_DEFAULT } from "../../utils/tools.js";
import { useDownload } from "../../hooks/useDownload.js";
import { useAdvOptions } from "../../hooks/useAdvOptions.js";
import { useLang } from "../../context/LangContext.jsx";
import { convertJob, compressJob, gifJob, fileUrl as absFileUrl, saveToDesktop } from "../../services/api.js";
import { fmtBytes } from "../../utils/formatters.js";
import ToolSwitcher from "./ToolSwitcher.jsx";
import GifOptions from "./GifOptions.jsx";
import RatingStars from "../ui/RatingStars.jsx";
import AdvancedOptions from "./AdvancedOptions.jsx";
import ScheduleBox from "./ScheduleBox.jsx";
import PlaylistDownloader from "./PlaylistDownloader.jsx";

/**
 * LinkInput — الأداة الموحدة:
 * 1) يختار المستخدم الأداة (فيديو/صوت/GIF/ضغط/قائمة تشغيل/جدولة)
 * 2) يحلل الرابط → معاينة
 * 3) يختار الجودة/الصيغة → يحمّل (مع كل الخيارات المتقدمة في لوحة واحدة)
 *
 * ⚠️ كان هنا حاجب خطة (Free ≤1080p والباقي Pro) ⇒ قفل جودات ورسائل ترقية
 * و صفحة أسعار. أُزيل نظام الدفع بالكامل: كل الجودات متاحة للجميع، ويبقى
 * عمود plan في القاعدة (يمكن منحه من لوحة الأدمن) دون أي أثر على الحدود.
 */
export default function LinkInput({ compact = false, initialUrl = "" }) {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const [url, setUrl] = useState(initialUrl);
  const [tool, setTool] = useState("video");
  const [quality, setQuality] = useState(() =>
    suggestQuality({ saveData: false, effectiveType: navigator.connection?.effectiveType || "4g" })
  );
  const [format, setFormat] = useState("mp4");
  const [gifOpts, setGifOpts] = useState(GIF_DEFAULT);
  const [detected, setDetected] = useState(null);
  const [listening, setListening] = useState(false);
  const [toolBusy, setToolBusy] = useState("");
  const [toolMsg, setToolMsg] = useState(null); // {label, fileUrl, size, savedPct}
  const [deskMsg, setDeskMsg] = useState(null); // نتيجة الحفظ على سطح المكتب
  const [deskBusy, setDeskBusy] = useState(false);
  const inputRef = useRef(null);
  const { adv } = useAdvOptions();
  const { status, info, job, progress, stage, error, fetchInfo, download, cancel, reset } = useDownload();

  const active = toolById(tool);
  const isPlaylist = active.kind === "playlist";
  const isSchedule = active.kind === "schedule";
  const isBulk = isPlaylist || isSchedule;
  // MP3 صوت فقط ⇒ الجودة لا تُطبَّق عليه (الخادم يحمّل الصوت ba/b مباشرة)
  const audioOnly = format === "mp3";

  // تبديل الأداة يضبط الصيغة على صيغة صالحة لها
  useEffect(() => {
    if (active.formats && !active.formats.includes(format)) setFormat(active.formats[0]);
  }, [tool]);

  // 🔍 Instant platform detection while typing
  useEffect(() => {
    if (!url.trim()) { setDetected(null); return; }
    const id = setTimeout(() => setDetected(detectPlatform(url)), 80);
    return () => clearTimeout(id);
  }, [url]);

  const thumb = useMemo(() => {
    if (info?.thumbnail) return info.thumbnail;
    if (detected?.platform && detected.videoId)
      return guessThumbnail(url, detected.platform.id, detected.videoId);
    return null;
  }, [info, detected, url]);

  const noWatermark = detected?.platform ? supportsNoWatermark(detected.platform.id) : false;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(text.trim()); inputRef.current?.focus(); }
    } catch {}
  };

  const handleFetch = () => { if (url.trim() && !isBulk) fetchInfo(url.trim()); };
  const handleDownload = () => {
    if (!url.trim() || isBulk) return;
    setToolMsg(null);
    // ⚠️ كان هنا سقف 1080p للخطة المجانية ⇒ أُزيل مع نظام الدفع
    download(url.trim(), {
      quality,
      format: formatForTool(tool, format),
      extra: adv,
      // 🎞️ خيارات GIF تُرسل مع الطلب (الخادم يقصّها) — بلا هذا كانت تُتجاهل
      gif: toolById(tool).gifOptions ? { ...gifOpts } : undefined,
    });
  };

  /** 🔧 أدوات ما بعد التحميل: MP3 / ضغط / GIF */
  const runTool = async (kind) => {
    if (!job?.jobId) return;
    setToolBusy(kind); setToolMsg(null);
    try {
      const r = kind === "mp3" ? await convertJob(job.jobId, "mp3")
        : kind === "zip" ? await compressJob(job.jobId, 28)
          : await gifJob(job.jobId, { ...gifOpts });
      setToolMsg({ label: kind === "mp3" ? "🎧 MP3 جاهز" : kind === "zip" ? "🗜️ النسخة المضغوطة جاهزة" : "🎞️ GIF جاهز", ...r });
    } catch (e) {
      setToolMsg({ label: "⚠️ " + (e.message || "فشلت الأداة"), error: true });
    } finally { setToolBusy(""); }
  };

  /** الضغط مدمج في التنزيل: ينزّل ثم يضغط تلقائياً قبل عرض النتيجة */
  const compressAfterDone = active.post === "compress";
  useEffect(() => {
    if (compressAfterDone && status === "done" && job?.jobId && !toolBusy && !toolMsg) runTool("zip");
  }, [compressAfterDone, status, job?.jobId]);

  /* ── 💾 الحفظ على سطح مكتب هذا الجهاز ──
     التطبيق يعمل محلياً ⇒ نسخ الملف يتم عبر السيرفر (صلاحية قرص)، فيظهر الملف
     على سطح المكتب مباشرة بلا نافذة "حفظ باسم". الملف المحفوظ = تنزيله، أو
     ناتج أداة (MP3/GIF/ضغط) إن وُجد، والخيار الأحدث أولاً. */
  const desktopTarget = (job?.status === "done" && job?.fileName
    ? job.fileName
    : toolMsg && !toolMsg.error && toolMsg.fileUrl
      ? String(toolMsg.fileUrl).split("/").pop()
      : "") || "";

  const saveOnDesktop = async () => {
    if (!desktopTarget || deskBusy) return;
    setDeskBusy(true); setDeskMsg(null);
    try {
      const r = await saveToDesktop(desktopTarget);
      setDeskMsg({ ok: true, text: r.path || r.fileName });
    } catch (e) {
      setDeskMsg({ ok: false, text: e.message || "تعذّر الحفظ على سطح المكتب" });
    } finally {
      setDeskBusy(false);
      setTimeout(() => setDeskMsg(null), 8000);
    }
  };

  // 🎤 Voice Search (Web Speech API)
  const voiceSearch = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = document.documentElement.lang || "ar";
      rec.interimResults = false;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript;
        if (text) setUrl(text.trim());
      };
      rec.start();
    } catch {}
  };

  return (
    <div className="w-full">
      {/* ── 1) الأدوات: كل الميزات في مكان واحد قبل التحميل ── */}
      <ToolSwitcher value={tool} onChange={setTool} className="mb-3" />
      <p className="mb-3 text-xs text-white/45">
        <span className="font-bold text-white/70">{active.icon} {active.label[ar ? "ar" : "en"]}:</span>{" "}
        {active.hint[ar ? "ar" : "en"]}
      </p>

      {/* قائمة التشغيل والجدولة لهما واجهتهما الخاصة (رابط واحد لكل منهما) */}
      {isPlaylist && <PlaylistDownloader />}
      {isSchedule && <ScheduleBox initialUrl={url} />}

      {/* ── Input Field ── */}
      <div className={`card-premium relative overflow-hidden p-1 ${isBulk ? "hidden" : ""}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative flex flex-col gap-3 sm:flex-row bg-void-100/50 rounded-[24px] p-1.5">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald/20 via-transparent to-mint/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[22px]" />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-white/50">
                🔗
              </span>
              <input
                ref={inputRef}
                dir="ltr"
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (status !== "idle") reset(); }}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                placeholder={t("hero.placeholder")}
                className="input-premium relative z-10 pl-14 pr-12 py-4 text-left bg-transparent"
                autoComplete="off"
                spellCheck={false}
              />
              {/* Platform badge */}
              <AnimatePresence>
                {detected?.platform && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 badge badge-emerald"
                    style={{ borderColor: detected.platform.color + "66" }}
                  >
                    <span className="text-xl">{detected.platform.icon}</span>
                    {detected.platform.name}
                    <span className="opacity-60 text-[10px]">· {detected.ms}ms</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handlePaste}
                className="btn-ghost btn-icon hidden sm:flex"
                title={t("hero.pasteTooltip") || "Paste from clipboard"}
                aria-label="Paste"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>

              {/* Voice Search */}
              {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                <button
                  onClick={voiceSearch}
                  className={`btn-ghost btn-icon ${listening ? "border-red-500/50 bg-red-500/10 animate-pulse" : ""}`}
                  title={t("hero.voiceTooltip") || "Voice search"}
                  aria-label="Voice search"
                >
                  {listening ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-6 0z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-6 0z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                  )}
                </button>
              )}

              <button
                onClick={handleFetch}
                disabled={!url.trim() || status === "fetching"}
                className="btn-primary flex-1 sm:flex-none group"
              >
                <span className="flex items-center justify-center gap-2">
                  {status === "fetching" ? (
                    <>
                      <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/></svg>
                      {t("hero.analyzing")}
                    </>
                  ) : (
                    <>
                      <span className="relative z-10">⚡</span>
                      {t("hero.fetchBtn")}
                    </>
                  )}
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-emerald-light to-emerald opacity-0 group-hover:opacity-20 transition-opacity rounded-[22px]" />
              </button>
            </div>
          </div>

          {/* Quick Platform Chips */}
          {!compact && !isBulk && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-white/45"
            >
              <span className="font-medium">{t("hero.tryLabel")}:</span>
              {["YouTube", "TikTok", "Instagram", "X", "Facebook", "Reddit"].map((p) => (
                // ⚠️ كان hover فقط بلا onClick ⇒ يبدو قابلاً للضغط فيحاول المستخدم الضغط
                // عليه مراراً بلا أي شيء يحدث. أزلنا التأثير التفاعلي.
                <span
                  key={p}
                  aria-hidden="true"
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/60"
                >
                  {p}
                </span>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ── Error Toast ── */}
      <AnimatePresence>
        {error && !isBulk && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3 text-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span className="text-red-200">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Preview Card ── */}
      <AnimatePresence>
        {!isBulk && (status === "ready" || status === "downloading" || status === "done") && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mt-4 card-premium overflow-hidden"
          >
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Thumbnail */}
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-void-200">
                {thumb ? (
                  <motion.img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                    initial={{ scale: 1.05 }}
                    animate={{ scale: 1 }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-6xl">
                    {detected?.platform?.icon || "🎬"}
                  </div>
                )}
                {info?.duration && (
                  <span className="absolute bottom-3 right-3 rounded-lg bg-black/80 backdrop-blur px-2.5 py-1 text-xs font-black">
                    {info.duration}
                  </span>
                )}
                {status === "downloading" && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center p-4">
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald via-mint to-emerald"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Info & Controls */}
              <div className="flex flex-col justify-between">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black leading-snug">
                    {info?.title || t("preview.readyTitle")}
                  </h3>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {noWatermark && (
                      <span className="badge badge-emerald flex items-center gap-1">
                        <span className="text-lg">✨</span>
                        {t("preview.noWatermark")}
                      </span>
                    )}
                    {detected?.platform && (
                      <span className="badge badge-neutral flex items-center gap-1">
                        <span className="text-lg">⚡</span>
                        {t("preview.detectedIn")} {detected.ms}ms
                      </span>
                    )}
                    {info?.uploader && (
                      <span className="badge badge-neutral flex items-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {info.uploader}
                      </span>
                    )}
                    {info?.durationSec && (
                      <span className="badge badge-neutral flex items-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {info.duration}
                      </span>
                    )}
                  </div>

                  {/* Quality Selector — يظهر فقط للأدوات التي تدعم الجودة (وليس MP3: صوت فقط) */}
                  {active.qualities && !audioOnly && (
                    <div className="mt-5">
                      <label className="block text-xs font-black text-white/60 mb-2">
                        {t("preview.quality")}
                      </label>
{/* ⚠️ كانت motion.button + whileHover/whileTap: تحريك الزر أثناء
                          الضغط (scale) يجعل mousedown وmouseup يقعان على
                          عنصرين مختلفين ⇒ لا يُطلَق click ⇒ يجب ضغط الزر أكثر من
                          مرة. الآن زر عادي بلا transform وتغيير لوني فقط،
                          وضغطة واحدة تكفي (فأرة/لمس/لوحة مفاتيح). */}
                      <div className="flex flex-wrap gap-2">
                        {QUALITIES.map((q) => (
                          <button
                            type="button"
                            key={q}
                            onClick={() => setQuality(q)}
                            /* الاختيار يتم عند الضغط نفسه (pointerdown) لا عند
                               CLICK: لو ضاع الحدث لأي سبب (تحريك تحت المؤشر،
                               عنصر يعلو الزر، لمسة متقطعة) يبقى الاختيار
                               مضموناً بضغطة واحدة. */
                            onPointerDown={() => setQuality(q)}
                            title={q}
                            aria-pressed={quality === q}
                            className={`select-none touch-manipulation rounded-xl px-3 py-2 text-xs font-black transition-colors duration-150 ${
                              quality === q
                                ? "bg-gradient-to-r from-emerald to-emerald-dark text-on-accent shadow-[0_4px_20px_rgba(29,185,84,0.4)]"
                                : "bg-white/5 text-white/70 hover:bg-emerald/15 hover:text-white hover:border-emerald/30 border border-white/10"
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Format Selector — صيغ الأداة المختارة فقط */}
                  <div className="mt-4">
                    <label className="block text-xs font-black text-white/60 mb-2">{t("preview.format")}</label>
                    <div className="flex flex-wrap gap-2">
                      {(active.formats || []).map((fid) => {
                        const f = FORMATS.find((x) => x.id === fid) || { id: fid, desc: "" };
                        return (
                          <button
                            type="button"
                            key={f.id}
                            onClick={() => setFormat(f.id)}
                            onPointerDown={() => setFormat(f.id)}
                            title={f.desc}
                            aria-pressed={format === f.id}
                            className={`select-none touch-manipulation rounded-xl px-3 py-2 text-xs font-black transition-colors duration-150 ${
                              format === f.id
                                ? "bg-gradient-to-r from-mint to-emerald text-on-accent"
                                : "bg-white/5 text-white/70 hover:bg-emerald/15 hover:text-white hover:border-emerald/30 border border-white/10"
                            }`}
                          >
                            {f.id.toUpperCase()}
                          </button>
                        );
                      })}
                      {active.formats?.length === 1 && (
                        <span className="self-center text-[11px] text-white/40">
                          {t("tools.lockedFormat") || "صيغة ثابتة لهذه الأداة"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 🎞️ خيارات GIF الكاملة — تُرسل مع طلب التنزيل */}
                  {active.gifOptions && (
                    <GifOptions value={gifOpts} onChange={setGifOpts} durationSec={info?.durationSec} compact={compact} />
                  )}
                </div>

                {/* Download Button / Progress */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  {status === "downloading" ? (
                    <div className="space-y-3">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full progress-shimmer rounded-full"
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-white/50">
                          {Math.round(progress)}% — {job?.notice || (stage === "processing" ? (t("preview.processing") || "جارٍ الدمج/التحويل…") : (t("preview.preparing") || "جارٍ التحميل…"))}
                        </p>
                        <button onClick={cancel} className="btn-ghost !py-1.5 !px-3 text-xs !border-red-500/40 !text-red-300">
                          ✕ {t("preview.cancel") || "إلغاء"}
                        </button>
                      </div>
                    </div>
                  ) : status === "done" ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="badge badge-success flex items-center gap-1 text-sm">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          {t("preview.done")}
                        </span>
                        {job?.size > 0 && <span className="text-xs text-white/45">💾 {fmtBytes(job.size)}</span>}
                      </div>

                      {/* رابط الحفظ الحقيقي */}
                      {job?.fileUrl && (
                        <a
                          href={absFileUrl(job.fileUrl)}
                          download={job.fileName || true}
                          className="btn-primary w-full sm:w-auto group"
                        >
                          <span className="flex items-center justify-center gap-2 relative z-10">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            {t("preview.saveFile") || "حفظ الملف على جهازك"}
                          </span>
                          <span className="absolute inset-0 bg-gradient-to-r from-emerald-light to-emerald opacity-0 group-hover:opacity-20 transition-opacity rounded-[22px]" />
                        </a>
                      )}

                      {/* نسخة داخل البطاقة أيضاً — نفس زر الزاوية */}
                      {job?.fileName && (
                        <button
                          type="button"
                          onClick={saveOnDesktop}
                          disabled={deskBusy}
                          className="btn-ghost btn-primary-sm !text-xs"
                        >
                          {deskBusy ? "⏳…" : "💾"} {ar ? "سطح المكتب" : "Desktop"}
                        </button>
                      )}

                      {/* 🔧 أدوات ما بعد التحميل — بديل سريع لكل أداة */}
                      {job?.format !== "mp3" && !compressAfterDone && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                          <span className="text-xs font-bold text-white/45">🔧 {t("preview.tools") || "أدوات"}:</span>
                          <button onClick={() => runTool("mp3")} disabled={!!toolBusy} className="btn-ghost !px-3 !py-1.5 text-xs">
                            {toolBusy === "mp3" ? "⏳…" : "🎧 MP3"}
                          </button>
                          <button onClick={() => runTool("zip")} disabled={!!toolBusy} className="btn-ghost !px-3 !py-1.5 text-xs">
                            {toolBusy === "zip" ? "⏳…" : "🗜️ ضغط"}
                          </button>
                          <button onClick={() => runTool("gif")} disabled={!!toolBusy} className="btn-ghost !px-3 !py-1.5 text-xs">
                            {toolBusy === "gif" ? "⏳…" : "🎞️ GIF"}
                          </button>
                        </div>
                      )}
                      {compressAfterDone && toolBusy === "zip" && (
                        <p className="text-xs text-mint">🗜️ {t("tools.compressing") || "جارٍ الضغط…"}</p>
                      )}

                      {toolMsg && (
                        toolMsg.error ? (
                          <p className="text-xs text-red-300">{toolMsg.label}</p>
                        ) : (
                          <a href={absFileUrl(toolMsg.fileUrl)} download className="btn-ghost btn-primary-sm !text-xs">
                            ⬇️ {toolMsg.label}{toolMsg.size > 0 && ` — ${fmtBytes(toolMsg.size)}`}
                            {toolMsg.savedPct > 0 && ` (وفّرت ${toolMsg.savedPct}%)`}
                          </a>
                        )
                      )}

                      {/* ⭐ نجوم التقييم — CSS وHTML كما ورد الطلب */}
                      <RatingStars className="mt-1" />

                      <button onClick={reset} className="btn-ghost !py-2 text-xs">{t("preview.newLink")}</button>
                    </motion.div>
                  ) : (
                    /* ⚠️ كان motion.button مع whileTap={{scale:0.98}}: التصغير
                       أثناء الضغط يحرّك الزر تحت المؤشر فيضيع onclick ⇒ المستخدم
                       يضغط مرتين. زر عادي بلا transform. */
                    <button
                      onClick={handleDownload}
                      className="btn-primary w-full sm:w-auto group"
                    >
                      <span className="flex items-center justify-center gap-2 relative z-10">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {active.icon} {t("preview.downloadBtn")} · {formatForTool(tool, format).toUpperCase()}
                        {active.qualities && !audioOnly && ` · ${quality}`}
                      </span>
                      <span className="absolute inset-0 bg-gradient-to-r from-emerald-light to-emerald opacity-0 group-hover:opacity-20 transition-opacity rounded-[22px]" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 4) الخيارات المتقدمة: قص + ترجمة + كلمة سر + خيوط (مشتركة) ── */}
      {!isBulk && !compact && <AdvancedOptions />}

      {/* ── 💾 زر تحميل ثابت في الزاوية: الملف يظهر على سطح المكتب مباشرة ── */}
      {!compact && !isBulk && desktopTarget && (
        <div className="fixed bottom-6 end-6 z-40 flex flex-col items-end gap-2">
          {deskMsg && (
            <div
              role="status"
              className={`max-w-[70vw] break-all rounded-2xl border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur ${
                deskMsg.ok
                  ? "border-emerald/40 bg-emerald/15 text-emerald"
                  : "border-red-500/40 bg-red-500/10 text-red-300"
              }`}
            >
              {deskMsg.ok ? "✅ حُفظ على سطح المكتب: " : "⚠️ "}
              {deskMsg.text}
            </div>
          )}
          <button
            type="button"
            onClick={saveOnDesktop}
            disabled={deskBusy}
            title={ar ? "نسخ الملف إلى سطح مكتب هذا الجهاز" : "Copy the file to this computer's Desktop"}
            className="btn-primary !px-4 !py-3 shadow-glow disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm font-black">
              {deskBusy ? "⏳…" : "💾"} {ar ? "حفظ على سطح المكتب" : "Save to Desktop"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}