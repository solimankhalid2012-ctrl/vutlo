import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { Reveal, EASE } from "./Reveal.jsx";
import RatingStars from "../ui/RatingStars.jsx";
import useRating from "../../hooks/useRating.js";
import "../../styles/rating-widget.css";

const ZERO = { count: 0, average: 0, by: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

/**
 * ⭐ RatingWidget — بطاقة التقييم في الصفحة الرئيسية.
 *
 * رقم واحد من مصدر واحد: المتوسط والعدّاد يأتيان من الخادم (GET /api/rating)
 * ويتحدّثان لحظياً بعد أي تصويت هنا أو بعد التحميل في LinkInput — لا رقم
 * مزروع في الصفحة. النجوم نفسها RatingStars نفسه المستعمل بعد التحميل،
 * فيبقى التقييم منطقياً: نفس النجوم، نفس الأثر.
 */
export default function RatingWidget() {
  const { t } = useLang();
  const reduce = useReducedMotion();
  const { stats, error, busy, vote } = useRating();
  const s = stats || ZERO;

  // نلتقط الرفض كي لا يبقى promise معلّقاً — الرسالة نفسها تظهر من المتجر
  const pick = (n) => { vote(n).catch(() => {}); };

  return (
    <section className="py-10" aria-labelledby="rating-title">
      <Reveal>
        <h2 id="rating-title" className="text-center text-2xl font-black">⭐ {t("rating.title")}</h2>
        <p className="mt-2 text-center text-sm text-white/55">{t("rating.sub")}</p>
      </Reveal>

      <Reveal>
        <div className="rating-card mx-auto mt-6 max-w-3xl">
          {/* ── الرقم الحقيقي: المتوسط + العدّاد + التوزيع ── */}
          <div className="rating-card__score">
            <div className="rating-card__avg">
              {s.count > 0 ? s.average.toFixed(1) : "—"}
              <span className="rating-card__avgMax">/5</span>
            </div>
            <div className="rating-card__count" data-testid="rating-count">
              {s.count > 0
                ? t(s.count === 1 ? "rating.countOne" : "rating.count").replace("{n}", String(s.count))
                : t("rating.empty")}
            </div>

            <div className="rating-card__bars" aria-hidden="true">
              {[5, 4, 3, 2, 1].map((n) => {
                const value = s.by?.[n] || 0;
                const pct = s.count ? Math.round((value / s.count) * 100) : 0;
                return (
                  <div className="rating-card__bar" key={n}>
                    <span className="rating-card__barStar">★</span>
                    <span className="rating-card__barNum">{n}</span>
                    <span className="rating-card__track">
                      <motion.span
                        className="rating-card__fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: reduce ? 0 : 0.7,
                          ease: EASE,
                          delay: reduce ? 0 : (5 - n) * 0.05,
                        }}
                      />
                    </span>
                    <span className="rating-card__barValue">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── النجوم: التصويت نفسه الذي يظهر بعد التحميل ── */}
          <div className="rating-card__vote">
            <RatingStars storageKey="vv-rating" onChange={pick} className="rating-card__stars" uid="widget" />
            <p className="rating-card__hint" role="status">
              {busy
                ? t("rating.saving")
                : error
                  ? null
                  : t("rating.hint")}
            </p>
            {error && (
              <p className="rating-card__error" role="alert">{error}</p>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
