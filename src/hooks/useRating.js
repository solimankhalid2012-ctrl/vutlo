import { useEffect, useState } from "react";
import { useLang } from "../context/LangContext.jsx";
import {
  subscribeRating,
  ratingSnapshot,
  fetchRating,
  postRating,
  myRating,
} from "../services/ratingApi.js";

/**
 * useRating — وصول مشترك لإحصاءات النجوم.
 *
 * المتجر في ratingApi.js واحد لكل التطبيق، فاستعلام GET واحد في الجلسة،
 * وأي تصويت (من الصفحة الرئيسية أو من رابط التحميل) يحدّث كل من يعرض
 * العدّاد فوراً بلا إعادة طلب.
 */
export default function useRating() {
  const { lang } = useLang();
  const [state, setState] = useState(ratingSnapshot);

  useEffect(() => {
    const unsubscribe = subscribeRating(setState);
    fetchRating(lang); // لا يعيد الطلب إن كانت الإحصاءات مخزّنة
    return unsubscribe;
  }, [lang]);

  /** يرمي عند الفشل ليعالجه المتصل (المعروض في state.error) */
  const vote = (stars) => postRating(stars, lang);

  return { ...state, vote, mine: myRating() };
}
