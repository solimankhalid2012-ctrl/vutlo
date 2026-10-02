import { useCallback, useEffect, useState } from "react";

/** الإعدادات الافتراضية للخيارات المتقدمة (تُحفظ في localStorage تحت vv-adv) */
export const ADV_DEFAULTS = {
  password: "",
  trimStart: "",
  trimEnd: "",
  subs: false,
  threads: 8,
};

const KEY = "vv-adv";

function readStore() {
  try {
    return { ...ADV_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...ADV_DEFAULTS };
  }
}

/* متجر مشترك خارج React حتى تبقى كل نسخ useAdvOptions (LinkInput /
   AdvancedOptions / ScheduleBox) متزامنة لحظياً بدل نسخ مستقلة من localStorage. */
let store = typeof localStorage === "undefined" ? { ...ADV_DEFAULTS } : readStore();
const listeners = new Set();
let savedTimer = null;

function emit() {
  listeners.forEach((fn) => fn(store));
}

function commit(next) {
  store = next;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  emit();
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    listeners.forEach((fn) => fn(store, false));
  }, 1800);
}

/** آخر حالة محفوظة (للمكوّنات التي لا تحتاج حالة تفاعلية) */
export function getAdvOptions() {
  return store;
}

export function setAdvOptions(fields) {
  commit({ ...store, ...fields });
}

/** مزامنة بين تبويبات ونوافذ المتصفح */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      store = readStore();
      emit();
    }
  });
}

/**
 * useAdvOptions — حالة مشتركة للخيارات المتقدمة بين الرئيسية وصفحة التحميل.
 * تحفظ تلقائياً في localStorage وتُبلّغ عن "تم الحفظ" لعرض رسالة خفيفة.
 */
export function useAdvOptions() {
  const [adv, setAdv] = useState(store);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fn = (state, isSaved = true) => {
      setAdv(state);
      if (isSaved) setSaved(true);
    };
    listeners.add(fn);
    fn(store, false);
    return () => listeners.delete(fn);
  }, []);

  /** يحدّث حقلاً واحداً حسب نوعه (checkbox / نص / رقم) */
  const set = useCallback((key) => (e) => {
    const v = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setAdvOptions({ [key]: v });
  }, []);

  /** يطبّق مجموعة حقول دفعة واحدة (مثال: عند تبديل الأداة) */
  const patch = useCallback((fields) => setAdvOptions(fields), []);

  /** هل هناك قصّ أو ترميز محدّد؟ */
  const hasTrim = useCallback(
    () => adv.trimStart !== "" || adv.trimEnd !== "",
    [adv.trimStart, adv.trimEnd],
  );

  return { adv, set, patch, saved, hasTrim };
}

export default useAdvOptions;
