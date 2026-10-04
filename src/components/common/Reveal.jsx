import React, { createContext, useContext, useMemo } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";

/* ══════════════════════════════════════════════════════════════
   نظام الحركة — هادئ، مقتصد، وي-respect إعدادات المستخدم
   المبادئ:
   • المسافة صغيرة (8-14px) — الشرائح الكبيرة تبدو "رخيصة"
   • Transform + opacity فقط (GPU) — لا blur ولا shadow متحرك
   • easing واحد متناسق في الموقع كله
   • لا حركة لمحتوى أعلى الشاشة عند التحميل (يمنع الوميض)
   • احترام كامل لـ prefers-reduced-motion
   ══════════════════════════════════════════════════════════════ */

/** المنحنى الموحّد: expo-out — بداية سريعة ونهاية ناعمة جداً */
export const EASE = [0.16, 1, 0.3, 1];

/** مدد موحّدة */
const DURATION = { fast: 0.32, base: 0.55, slow: 0.8 };

const MotionPrefs = createContext({ reduce: false });
export const MotionProvider = ({ children }) => {
  const reduce = !!useReducedMotion();
  const value = useMemo(() => ({ reduce }), [reduce]);
  return <MotionPrefs.Provider value={value}>{children}</MotionPrefs.Provider>;
};
const usePrefs = () => useContext(MotionPrefs);

/* ─────────────────────────  Reveal  ─────────────────────────
   ظهور تدريجي عند التمرير. الافتراضي: حركة طفيفة + تلاشٍ.
  Variant="up" حركة أعلى قليلاً، "none" تلاشٍ نقي فقط.          */
export function Reveal({
  children,
  delay = 0,
  y = 12,
  scale,
  variant = "soft",
  className = "",
  as = "div",
  amount = 0.2,
  once = true,
}) {
  const { reduce } = usePrefs();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Comp = motion[as] || motion.div;

  const from =
    variant === "none"
      ? { opacity: 0 }
      : scale !== undefined
        ? { opacity: 0, y, scale }
        : { opacity: 0, y };

  return (
    <Comp
      className={className}
      initial={from}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once, amount }}
      transition={{ duration: DURATION.slow, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/* ────────────────────────  Stagger  ────────────────────────
   يُظهر أبناءه تباعاً بفارق زمني ثابت — بدل تكرار delay يدوياً */
export function Stagger({ children, step = 0.06, base = 0, className = "", amount = 0.15 }) {
  const { reduce } = usePrefs();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: step, delayChildren: base } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** عنصر ابن لـ Stagger — يقرأ تدرّج الأب تلقائياً */
export const StaggerItem = ({ children, y = 10, className = "", as = "div" }) => {
  const { reduce } = usePrefs();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Comp = motion[as] || motion.div;
  return (
    <Comp
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
      }}
    >
      {children}
    </Comp>
  );
};

/* ─────────────────────  PageTransition  ─────────────────────
   تلاشٍ نقي عند تبديل المسار — بلا إزاحة (الانزلاق يسبب قفزة بصري
   مزعجة ويكشف حدود التخطيط)                                   */
export function PageTransition({ children, pathname }) {
  const { reduce } = usePrefs();
  if (reduce) return <>{children}</>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.fast, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ─────────────────────  Scale / Tap  ─────────────────────
   رد فعل صغير موحّد للزِر والبطاقات — يحدّ من "القفز" الغبي.
   ⚠️ whileTap بلا scale عمداً: تصغير الزر أثناء الضغط يحرّكه تحت المؤشر،
   فيقع mousedown وmouseup على عنصرين مختلفين ويضيع onclick (المشكلة الشهيرة:
   "لازم أضغط مرتين"). التفاعل البصري عند الضغط = لون فقط. */
export const pressable = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 1 },
  transition: { duration: DURATION.fast, ease: EASE },
};

/** عدّاد رقمي يتصاعد عند ظهوره (للإحصائيات) */
export function CountUp({ to, duration = 1.2, className = "" }) {
  const { reduce } = usePrefs();
  const [n, setN] = React.useState(reduce ? to : 0);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (reduce) { setN(to); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min((now - t0) / (duration * 1000), 1);
          const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
          setN(Math.round(eased * to));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration, reduce]);

  return <span ref={ref} className={className}>{n.toLocaleString()}</span>;
}

export default Reveal;
