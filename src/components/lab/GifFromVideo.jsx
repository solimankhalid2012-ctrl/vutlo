import React, { useEffect, useRef, useState } from "react";
import { useLang } from "../../context/LangContext.jsx";
import { GIF_DEFAULT } from "../../utils/tools.js";
import { uploadFile, gifFromUpload, absoluteUrl, downloadFile } from "../../services/uploadApi.js";
import GifOptions from "../downloader/GifOptions.jsx";
import ScanReport from "./ScanReport.jsx";

/** مدة الفيديو من بياناته الوصفية (قبل الرفع) — GifOptions يحتاجها ليحدّ البداية */
function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

/**
 * 🎞️ GifFromVideo — فيديو **محلي على جهازك** ⇒ GIF.
 *
 * المسار: (1) رفع الفيديو برابط دائم (2) FFmpeg على الخادم (3) GIF جديد
 * برابط دائم خاص به. كل خطوة لها تقرير مسح — لأن ما يُرفع يُفحص أولاً.
 */
export default function GifFromVideo() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [file, setFile] = useState(null);
  const [up, setUp] = useState(null);         // نتيجة رفع الفيديو
  const [upPct, setUpPct] = useState(0);
  const [dur, setDur] = useState(0);
  const [opts, setOpts] = useState({ ...GIF_DEFAULT });
  const [busy, setBusy] = useState(false);
  const [gif, setGif] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);   // جارٍ سحب GIF إلى الجهاز
  const [dlPct, setDlPct] = useState(0);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => { if (up?.url) URL.revokeObjectURL(up.url); }, [up]);

  const pick = async (f) => {
    if (!f) return;
    if (!/^video\//i.test(f.type || "") && !/\.(mp4|mov|webm|mkv|avi|m4v|mpg|mpeg|wmv|flv|3gp|ts|ogv)$/i.test(f.name || "")) {
      setErr({ error: ar ? "اختر ملف فيديو" : "Pick a video file" });
      return;
    }
    setFile(f); setGif(null); setErr(null); setUp(null); setUpPct(0);
    setDur(await readDuration(f));
    setBusy(true);
    try {
      setUp(await uploadFile(f, { onProgress: setUpPct, lang }));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    if (!up?.id) return;
    setBusy(true); setErr(null);
    try {
      setGif(await gifFromUpload(up.id, opts, lang));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  /** حفظ GIF على قرص المستخدم: السحب blob ثم الاسم السليم (gif.name من الخادم) */
  const save = async () => {
    if (!gif?.url || saving) return;
    setSaving(true); setDlPct(0); setSaved(false);
    try {
      const ok = await downloadFile(gif.url, gif.name || "vutlo.gif", setDlPct);
      setSaved(ok);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lab-panel">
      <div
        className={`dropzone ${busy ? "is-busy" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer?.files?.[0]); }}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        data-testid="gif-drop"
      >
        <div className="dz-icon" aria-hidden="true">🎞️</div>
        <div className="dz-title">
          {busy
            ? up ? (ar ? "جارٍ التحويل…" : "Converting…") : `${ar ? "جارٍ الرفع" : "Uploading"} ${Math.round(upPct * 100)}%`
            : (ar ? "أفلت فيديو من جهازك" : "Drop a video from your device")}
        </div>
        <div className="dz-hint">
          {file ? `${file.name}${dur ? ` · ${dur.toFixed(1)}s` : ""}` : (ar ? "MP4 / WebM / MOV — الإعدادات بعده" : "MP4 / WebM / MOV — options come next")}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
          data-testid="gif-input"
        />
      </div>

      {err && (
        <p className="mt-3 text-sm text-red-300" data-testid="gif-error">⚠️ {err.error}</p>
      )}

      {up && (
        <>
          <p className="mt-3 text-xs text-emerald">
            ✓ {ar ? "تم رفع الفيديو" : "Video uploaded"} ·{" "}
            <code dir="ltr">{up.url}</code>
          </p>
          <GifOptions value={opts} onChange={setOpts} durationSec={dur} />
          <button type="button" className="btn-gold mt-3 w-full" onClick={convert} disabled={busy} data-testid="gif-convert">
            {busy ? "⏳" : ar ? "حوّل إلى GIF" : "Convert to GIF"}
          </button>
        </>
      )}

      {gif && (
        <div className="mt-4 space-y-2" data-testid="gif-result">
          <img src={absoluteUrl(gif.url)} alt="GIF" className="max-h-72 w-full rounded-xl border border-white/10 bg-black/30 object-contain" />
          <div className="flex flex-wrap items-center gap-2">
            <code className="grow truncate rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm text-mint" dir="ltr">
              {absoluteUrl(gif.url)}
            </code>
            <span className="text-xs text-white/50">{(gif.size / 1048576).toFixed(2)}MB</span>
          </div>

          {/* الزر الأساسي: حفظ الملف فعلاً على القرص — الرابط العادي يفتحه
              في تبويب (Content-Disposition: inline) ولا ينزّله. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary grow sm:grow-0"
              onClick={save}
              disabled={saving}
              aria-busy={saving}
              data-testid="gif-download"
            >
              {saving
                ? `⏳ ${ar ? "جارٍ التنزيل" : "Downloading"} ${Math.round(dlPct * 100)}%`
                : `⬇️ ${ar ? "تنزيل GIF إلى الجهاز" : "Download GIF to my device"}`}
            </button>
            <a
              href={absoluteUrl(gif.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              data-testid="gif-open"
            >
              {ar ? "فتح في تبويب" : "Open in a tab"}
            </a>
          </div>

          {saving && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" data-testid="gif-dl-progress">
              <div className="h-full bg-emerald transition-[width] duration-150" style={{ width: `${Math.max(3, dlPct * 100)}%` }} />
            </div>
          )}
          {saved && (
            <p className="text-xs font-bold text-emerald" data-testid="gif-saved" role="status">
              ✓ {ar ? `حُفظ الملف باسم ${gif.name}` : `Saved as ${gif.name}`}
            </p>
          )}
          {gif.scan && <ScanReport report={gif.scan} compact />}
        </div>
      )}
    </div>
  );
}
