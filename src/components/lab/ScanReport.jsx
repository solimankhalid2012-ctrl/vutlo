import React from "react";
import { useLang } from "../../context/LangContext.jsx";

/** ألوان ونصوص الحكم — مصدر واحد حتى لا تتناقض الأدوات الثلاث */
const VERDICT_STYLE = {
  safe: { ring: "#1db954", text: "#8fe3b8", icon: "✅" },
  caution: { ring: "#f59e0b", text: "#fcd34d", icon: "⚠️" },
  danger: { ring: "#ef4444", text: "#fca5a5", icon: "⛔" },
};

const fmtSize = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
};

/**
 * ScanReport — عرض تقرير الماسح (الformatter العربي موجود داخل الماسح نفسه:
 * كل سبب يحمل ar/en معاً ⇒ الواجهة لا تحتاج جدول ترجمة إضافياً).
 */
export default function ScanReport({ report, compact = false }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  if (!report) return null;
  const v = VERDICT_STYLE[report.verdict] || VERDICT_STYLE.caution;
  const d = report.detected || {};
  const label = d.label ? (ar ? d.label.ar : d.label.en) : d.ext || "—";
  const txt = (r) => (ar ? r.ar : r.en);

  return (
    <div className="scan-report" data-testid="scan-report" data-verdict={report.verdict}>
      {/* الشريط: نقطة واحدة تجمع الحالة + الصيغة + النتيجة */}
      <div className="scan-head">
        <div className="scan-verdict" style={{ borderColor: v.ring, color: v.text }}>
          <span aria-hidden="true">{v.icon}</span>
          <div>
            <div className="scan-score" style={{ color: v.text }}>
              {report.score}
              <small>/100</small>
            </div>
            <div className="scan-verdict-text">{txt(report.texts || { ar: "غير مصنّف", en: "Unclassified" })}</div>
          </div>
        </div>
        <div className="scan-meta">
          <div><b>{ar ? "الصيغة الحقيقية" : "Real format"}</b><span>{label}{d.by === "magic" ? " ✓" : ""}</span></div>
          <div><b>{ar ? "الامتداد" : "Extension"}</b><span>{report.ext ? "." + report.ext : "—"}</span></div>
          {report.language && <div><b>{ar ? "اللغة" : "Language"}</b><span>{report.language}</span></div>}
          {!compact && <div><b>{ar ? "الانتروبيا" : "Entropy"}</b><span>{Number(report.entropy || 0).toFixed(2)}</span></div>}
        </div>
      </div>

      {/* شريط التقدّر */}
      <div className="scan-bar" role="meter" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.min(100, Math.max(2, report.score))}%`, background: v.ring }} />
      </div>

      {report.reasons?.length > 0 && (
        <ul className="scan-reasons">
          {report.reasons.map((r) => (
            <li key={r.id}>
              <span className="scan-chip" style={{ borderColor: v.ring, color: v.text }}>{r.weight}</span>
              {txt(r)}
            </li>
          ))}
        </ul>
      )}

      <p className="scan-disclaimer">
        {txt(report.disclaimer || { ar: "فحص هيكلي، ليس بديلاً عن مضاد فيروسات.", en: "Structural scan, not an antivirus replacement." })}
      </p>
      {report.size != null && <p className="scan-size">{fmtSize(report.size)}</p>}
    </div>
  );
}
