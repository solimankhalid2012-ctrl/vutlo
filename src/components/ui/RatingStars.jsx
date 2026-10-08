import React, { useState } from "react";
import { useLang } from "../../context/LangContext.jsx";

/**
 * ⭐ RatingStars — نجوم التقييم بالـCSS والكود حرفياً كما ورد الطلب.
 *
 * البنية HTML كما هي تماماً: input[type=radio] مخفي + label يحوي svgOne
 * (النجمة الفارغة) فوق svgTwo (النجمة الذهبية) و div.ombre (الظل).
 * الاتجاه row-reverse يجعل أول input = 5 نجوم على اليمين.
 *
 * الفرق الوحيد عن HTML الأصلي: React — فنستخدم defaultChecked بدل checked
 * (المكوّن غير مُدار controlled) ونضيف onChange لحفظ التقييم محلياً.
 * CSS-verbatim lives in src/styles/rating.css
 */
const STARS = [5, 4, 3, 2, 1];

const STAR_POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";

/** نسخة SVG واحدة بطبقتيها (الفارغة ثم الذهبية) */
function StarSvg({ cls }) {
  return (
    <svg
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeWidth="2"
      stroke="#000000"
      fill="none"
      viewBox="0 0 24 24"
      height="35"
      width="35"
      xmlns="http://www.w3.org/2000/svg"
      className={cls}
    >
      <polygon points={STAR_POINTS} />
    </svg>
  );
}

/** قراءة التقييم المحفوظ مسبقاً (بلا useEffect ⇒ defaultChecked يطبَّق من أول رسم) */
function readSaved(key) {
  try {
    const n = Number(localStorage.getItem(key) || 0);
    return n >= 1 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

export default function RatingStars({ storageKey = "vv-rating", onChange, className = "", uid = "" }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [value, setValue] = useState(() => readSaved(storageKey));

  /* قد تظهر مجموعتا نجوم في الصفحة نفسها (البطاقة + نتائج التحليل).
     بدون تسمية فريدة يتشارك الـid واسم المجموعة ⇒ يتقاطع الاختيار بينهما.
     uid اختياري: غيابه يبقي البنية كما هي حرفياً (star4 / name="rating"). */
  const name = uid ? `rating-${uid}` : "rating";
  const idOf = (n) => (uid ? `${uid}-star${n}` : `star${n}`);

  const pick = (n) => {
    setValue(n);
    try { localStorage.setItem(storageKey, String(n)); } catch {}
    onChange?.(n);
  };

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="rating" role="radiogroup" aria-label={ar ? "تقييم من 5 نجوم" : "Rating out of 5 stars"}>
        {STARS.map((n) => (
          <React.Fragment key={n}>
            <input
              value={String(n)}
              name={name}
              id={idOf(n)}
              type="radio"
              defaultChecked={value === n}
              aria-checked={value === n}
              onChange={() => pick(n)}
            />
            <label
              title={n === 1 ? "1 star" : `${n} stars`}
              htmlFor={idOf(n)}
              /* input مخفي (display:none) ⇒ لا يمكن الوصول إليه بلوحة المفاتيح،
                 فنجعل label نفسه قابلاً للتركيز ويقبل Enter/مسافة.
                 لا تغيير في CSS أو البنية — سلوك إضافي فقط. */
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n); }
              }}
            >
              <StarSvg cls="svgOne" />
              <StarSvg cls="svgTwo" />
              <div className="ombre" />
            </label>
          </React.Fragment>
        ))}
      </div>
      <p className="text-[11px] font-bold text-white/45" role="status">
        {value > 0
          ? ar ? `شكراً — أعطيتنا ${value} من 5` : `Thanks — you rated us ${value}/5`
          : ar ? "قيّم تجربتك بالنجوم" : "Rate your experience"}
      </p>
    </div>
  );
}
