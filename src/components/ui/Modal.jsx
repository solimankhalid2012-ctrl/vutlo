import React, { useCallback, useEffect, useRef } from "react";

/**
 * نافذة حوارية.
 *
 * ♿ ما كان ناقصاً في النسخة السابقة (سطر واحد بلا أي معالجة):
 * - Escape يغلق النافذة (كان لا يمكن إغلاقها بالمفاتيح إطلاقاً).
 * - role="dialog" + aria-modal + اسم للنافذة (للقارئات الصوتية).
 * - حبس التركيز داخل النافذة والعودة لمكانه بعد الإغلاق.
 * - قفل تمرير الخلفية (على iOS كانت الصفحة تمرّر خلف النافذة).
 * - الإغلاق بالنقر على الخلفية عبر pointerdown لا click: مع click فقط
 *   لا تُغلق النافذة إذا بدأ المستخدم سحب التحديد خارجها.
 */
export default function Modal({ open, onClose, children, labelledBy, label }) {
  const panel = useRef(null);
  const lastFocus = useRef(null);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      // Tab داخل النافذة فقط
      if (e.key !== "Tab" || !panel.current) return;
      const focusables = panel.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // التركيز داخل النافذة عند فتحها
    panel.current?.querySelector("button, a[href], input, select, textarea")?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onPointerDown={(e) => {
        // نقرة/سحب يبدأ على الخلفية ⇒ إغلاق. يبدأ داخل اللوحة ⇒ لا إغلاق.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        className="card max-w-lg w-full max-h-[85vh] overflow-y-auto"
      >
        {children}
      </div>
    </div>
  );
}
