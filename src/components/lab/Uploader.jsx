import React, { useCallback, useRef, useState } from "react";
import { useLang } from "../../context/LangContext.jsx";
import { isLoggedIn } from "../../services/authApi.js";
import { uploadFile, absoluteUrl, downloadFile, UPLOAD_LIMITS } from "../../services/uploadApi.js";
import ScanReport from "./ScanReport.jsx";

/** نسخ للحافظة مع بديل للمتصفحات القديمة/السياق غير الآمن */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

/**
 * ⬆️ Uploader — رفع أي ملف ⇒ **رابط دائم** `/u/<id>` صالح في <img> و<video>
 * والمارك داون وكود المستخدم. السقف: 50MB للزائر و200MB للحساب.
 */
export default function Uploader() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [file, setFile] = useState(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState("");
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);   // جارٍ سحب الملف إلى الجهاز
  const [dlPct, setDlPct] = useState(0);
  const inputRef = useRef(null);

  const signed = isLoggedIn();
  const cap = signed ? UPLOAD_LIMITS.user : UPLOAD_LIMITS.guest;
  const capMB = Math.round(cap / 1048576);

  const send = useCallback(async (f) => {
    if (!f) return;
    if (f.size > cap) {
      setErr({ error: ar ? `الملف أكبر من سقفك (${capMB}MB)` : `File is larger than your ${capMB}MB limit`, status: 413 });
      setDone(null);
      return;
    }
    setFile(f); setBusy(true); setPct(0); setErr(null); setDone(null); setCopied("");
    try {
      setDone(await uploadFile(f, { onProgress: setPct, lang }));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }, [capMB, ar, lang]);

  const full = done ? absoluteUrl(done.url) : "";
  const snippets = done
    ? [
      { key: "html", label: "HTML", text: done.mode === "inline" ? `<img src="${full}" alt="${done.name}">` : `<a href="${full}">${done.name}</a>` },
      { key: "md", label: "Markdown", text: `[${done.name}](${full})` },
      { key: "url", label: ar ? "رابط مباشر" : "Direct URL", text: full },
    ]
    : [];

  const onCopy = async (key, text) => {
    if (await copy(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1600);
    }
  };

  /** حفظ الملف المرفوع على القرص (الرابط وحده يفتحه في تبويب ولا ينزّله) */
  const onDownload = async () => {
    if (!done?.url || saving) return;
    setSaving(true); setDlPct(0);
    try {
      await downloadFile(done.url, done.name, setDlPct);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lab-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-white/50">
          {ar ? "السقف الحالي" : "Your limit"}: <b className="text-emerald">{capMB}MB</b>
          {" · "}
          {signed
            ? (ar ? "حساب مسجَّل" : "signed in")
            : (ar ? `زائر — سجّل الدخول لرفع حتى ${Math.round(UPLOAD_LIMITS.user / 1048576)}MB` : `guest — log in for up to ${Math.round(UPLOAD_LIMITS.user / 1048576)}MB`)}
        </span>
        <span className="badge badge-emerald">{ar ? "رابط دائم" : "Permanent link"}</span>
      </div>

      <div
        className={`dropzone ${over ? "is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer?.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        data-testid="upload-drop"
      >
        <div className="dz-icon" aria-hidden="true">⬆️</div>
        <div className="dz-title">
          {busy
            ? `${ar ? "جارٍ الرفع" : "Uploading"} ${Math.round(pct * 100)}%`
            : (ar ? "أفلت صورة أو فيديو أو أي ملف" : "Drop an image, video or any file")}
        </div>
        <div className="dz-hint">
          {file && !busy ? `${file.name} · ${(file.size / 1048576).toFixed(2)}MB` : (ar ? "الملف يُحفظ على رابط دائم لا تنتهي صلاحيته" : "Stored behind a permanent link")}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }}
          data-testid="upload-input"
        />
      </div>

      {busy && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald transition-[width] duration-150" style={{ width: `${Math.max(3, pct * 100)}%` }} />
        </div>
      )}

      {err && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="upload-error">
          ⚠️ {err.error}
          {err.scan && <ScanReport report={{ ...err.scan, texts: null, disclaimer: null }} compact />}
        </div>
      )}

      {done && (
        <div className="mt-4 space-y-3" data-testid="upload-result">
          <div className="flex flex-wrap items-center gap-2">
            <code className="grow truncate rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm text-mint" data-testid="upload-url">
              {full}
            </code>
            <button
              type="button"
              className="btn-primary-sm"
              onClick={onDownload}
              disabled={saving}
              aria-busy={saving}
              data-testid="upload-download"
            >
              {saving ? `⏳ ${Math.round(dlPct * 100)}%` : `⬇️ ${ar ? "تنزيل" : "Download"}`}
            </button>
            <button type="button" className="btn-ghost-sm" onClick={() => onCopy("main", full)}>
              {copied === "main" ? "✓" : (ar ? "نسخ" : "Copy")}
            </button>
          </div>
          {saving && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald transition-[width] duration-150" style={{ width: `${Math.max(3, dlPct * 100)}%` }} />
            </div>
          )}

          {/* معاينة مباشرة — نضمن الأناواع سليمة قبل أن يستخدمها المستخدم */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            {done.mode === "inline" && /^image\//.test(done.mime) && (
              <img src={full} alt={done.name} className="max-h-64 w-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            {done.mode === "inline" && /^video\//.test(done.mime) && (
              <video src={full} controls className="max-h-64 w-full" />
            )}
            {done.mode === "inline" && /^audio\//.test(done.mime) && (
              <audio src={full} controls className="w-full p-3" />
            )}
            {done.mode !== "inline" && (
              <div className="flex items-center gap-3 p-4 text-sm text-white/70">
                <span aria-hidden="true">📦</span>
                <span className="truncate">{done.name}</span>
                <span className="ml-auto shrink-0 text-white/40">{(done.size / 1048576).toFixed(2)}MB</span>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {snippets.map((s) => (
              <div key={s.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-white/40">
                  {s.label}
                  <button type="button" onClick={() => onCopy(s.key, s.text)} className="text-emerald hover:text-mint">
                    {copied === s.key ? "✓" : (ar ? "نسخ" : "copy")}
                  </button>
                </div>
                <code className="block truncate text-[11px] text-white/70" dir="ltr">{s.text}</code>
              </div>
            ))}
          </div>

          {done.scan && <ScanReport report={{ ...done.scan, size: done.size }} compact />}
        </div>
      )}
    </div>
  );
}
