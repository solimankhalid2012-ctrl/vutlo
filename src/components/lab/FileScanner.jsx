import React, { useCallback, useRef, useState } from "react";
import { useLang } from "../../context/LangContext.jsx";
import { scan } from "../../../shared/fileScan.js";
import ScanReport from "./ScanReport.jsx";

const MAX_HEAD = 262144; // نفس SCAN_HEAD_BYTES في shared/fileScan.js

function bytesToBase64(bytes) {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

/** تحليل JSON بأمان: رد فارغ/مبتور/غير JSON يعيد {} بدل رمي Uncaught. */
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

/** يفحص رأس الملف بمحرك Python+C++ على الخادم ويُعيد تقريره إن نجح. */
async function serverScan({ name, size, head }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch("/api/lab/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, headB64: bytesToBase64(head) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("scan-failed");
    const rep = await safeJson(res);
    if (rep && rep.verdict && Array.isArray(rep.reasons) && rep.detected) return rep;
    throw new Error("bad-report");
  } finally {
    clearTimeout(timer);
  }
}

function engineLabel(engine, ar) {
  if (engine === "python+cpp") return ar ? "Python + C++ على الخادم" : "Python + C++ server engine";
  if (engine === "python") return ar ? "Python على الخادم" : "Python server engine";
  return ar ? "فحص محلي فوري" : "Instant local scan";
}

/**
 * 🔬 FileScanner — يفحص الملف بمحرك Python+C++ قبل رفعه.
 *
 * أول 256 كيلوبايت تُرسل إلى محرك الفحص على الخادم (Python يعمّقه بـ C++)
 * ولا تُخزَّن — وإن تعذّر الوصول للمحرك يفحص نفس البايتات محلياً فوراً.
 */
export default function FileScanner() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const run = useCallback(async (file) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      // نقرأ أول 256KB فقط (ملفات 2GB لا تُحمّل في الذاكرة كلها)
      const head = new Uint8Array(await file.slice(0, MAX_HEAD).arrayBuffer());
      let rep;
      try {
        rep = await serverScan({ name: file.name, size: file.size, head });
      } catch {
        rep = { ...scan({ name: file.name, bytes: head, size: file.size }), engine: "local" };
      }
      setReport(rep);
    } catch {
      setError(ar ? "تعذّر قراءة الملف" : "Could not read the file");
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [ar]);

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    run(e.dataTransfer?.files?.[0]);
  };

  return (
    <div className="lab-panel">
      <div
        className={`dropzone ${over ? "is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        data-testid="scan-drop"
      >
        <div className="dz-icon" aria-hidden="true">🔬</div>
        <div className="dz-title">
          {busy ? (ar ? "جارٍ الفحص…" : "Scanning…") : (ar ? "أفلت ملفاً هنا أو اضغط للاختيار" : "Drop a file here or click to choose")}
        </div>
        <div className="dz-hint">
          {ar
            ? "أول 256 كيلوبايت بفحصها محرك Python/C++ على الخادم — أو محلياً إن لم يتوفر"
            : "The first 256 KB are scanned by the Python/C++ engine — or locally if unavailable"}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { run(e.target.files?.[0]); e.target.value = ""; }}
          data-testid="scan-input"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-300">⚠️ {error}</p>}
      {report && (
        <div className="mt-4">
          <div className="mb-2 text-xs opacity-70" data-testid="scan-engine">
            🔭 {ar ? "محرك الفحص:" : "Scan engine:"} {engineLabel(report.engine, ar)}
          </div>
          <ScanReport report={report} />
        </div>
      )}
    </div>
  );
}