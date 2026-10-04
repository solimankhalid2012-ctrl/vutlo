import React from "react";
import { Link } from "react-router-dom";

/**
 * ⬇️ زر التحميل المتحرك — تصميم المستخدم مُكيَّفاً مع ألوان الموقع.
 *
 * Elements كما في التصميم الأصلي: circle (دائرة بيضاء تعبر الزر عند
 * hover) + سهم يمين + label + سهم مقلوب، وCSS في styles/animatedButton.css.
 *
 * @param {string} label      النص (مترجم) — يُقرأه قارئ الشاشة أيضاً
 * @param {string} to         مسار التنقل (react-router)
 * @param {string} variant    "sm" للهيدر | "block" لقائمة الجوال | "" للحجم العادي
 * @param {Function} onClick  如需在列表中额外关闭菜单，可在点击时传入回调
 */
export default function AnimatedDownloadButton({
  label,
  to = "/download",
  variant = "",
  onClick,
  className = "",
  children,
}) {
  const cls = ["animated-button", variant ? `animated-button--${variant}` : "", className]
    .filter(Boolean)
    .join(" ");
  const text = children ?? label;
  return (
    <Link to={to} onClick={onClick} className={cls} data-testid="download-animated-btn">
      <span className="circle" aria-hidden="true" />
      <span className="arrow--left" aria-hidden="true">⬇</span>
      <span>{text}</span>
      <span className="arrow" aria-hidden="true">⬇</span>
    </Link>
  );
}
