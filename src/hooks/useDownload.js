import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVideoInfo, startDownload, getJob, cancelJob } from "../services/api.js";

const POLL_MS = 1500;
const MAX_POLL_FAILS = 5; // نتسامح مع انقطاع قصير بدل Killing تحميل شغّال
const MAX_POLL_MS = 45 * 60 * 1000; // سقف 45 دقيقة ثم نوقف الاستطلاع

/**
 * useDownload — مدير التحميلات المدمج (multi-thread + resume + history)
 * - يجلب معلومات الفيديو من /api/info
 * - يبدأ التحميل من /api/download ثم يراقب التقدم الحقيقي عبر /api/job/:id
 * - عند النجاح: رابط تنزيل حقيقي + اسم الملف + الحجم + أدوات (mp3/ضغط/gif)
 */
export function useDownload() {
  const [status, setStatus] = useState("idle"); // idle|fetching|ready|downloading|done|error
  const [info, setInfo] = useState(null);
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const timer = useRef(null);
  const jobId = useRef(null);
  // معرّف جولة الاستطلاع: أي حلقة سابقة تصبح مهملة فور بدء جولة جديدة
  const round = useRef(0);

  const stopPolling = useCallback(() => {
    round.current += 1;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const fetchInfo = useCallback(async (url) => {
    setStatus("fetching"); setError("");
    try {
      const data = await fetchVideoInfo(url);
      setInfo(data); setStatus("ready");
      try {
        const h = JSON.parse(localStorage.getItem("vv-history") || "[]");
        if (!h.some((x) => x.url === url)) {
          h.unshift({ url, title: data.title, at: Date.now(), thumb: data.thumbnail });
        }
        localStorage.setItem("vv-history", JSON.stringify(h.slice(0, 100)));
      } catch {}
      return data;
    } catch (e) {
      setError(e.message || "تعذّر جلب معلومات الفيديو");
      setStatus("error");
      return null;
    }
  }, []);

  const download = useCallback(async (url, { quality = "1080p", format = "mp4", extra, gif } = {}) => {
    setStatus("downloading"); setProgress(0); setStage(""); setError(""); setJob(null);
    stopPolling();
    const myRound = round.current;
    try {
      const res = await startDownload(url, { quality, format, extra, gif });
      // ⚠️ لو بدأ المستخدم تحميلاً جديداً أو أعدنا الضبط أثناء الانتظار، نتخلّى
      // عن هذه النتيجة حتى لا تكتب حالة مهمة قديمة فوق المهمة الحالية.
      if (myRound !== round.current) return null;
      jobId.current = res?.jobId || null;
      if (!res?.jobId) { setError("لم يُرجع السيرفر معرّف المهمة"); setStatus("error"); return null; }
      setJob(res);

      // ⚠️ كان setInterval(async) ⇒ طلبات متداخلة تتراكم إذا استغرق الرد أكثر من 1.5s،
      // وتبقى تعمل بعد إزالة المكوّن فتحديث حالة على مكوّن مُزال.
      // الآن: setTimeout ذاتي الجدولة (بلا تداخل) + تسامح مع انقطاع مؤقت + سقف زمني.
      const startedAt = Date.now();
      let fails = 0;
      const tick = async () => {
        if (myRound !== round.current) return;
        try {
          const j = await getJob(res.jobId);
          if (myRound !== round.current) return;
          fails = 0;
          setJob(j);
          setProgress(j.progress || 0);
          setStage(j.stage || "");
          if (j.status === "done") { stopPolling(); setProgress(100); setStatus("done"); return; }
          if (j.status === "error") { stopPolling(); setError(j.error || "فشل التحميل"); setStatus("error"); return; }
          if (j.status === "cancelled") { stopPolling(); setError(j.error || "أُلغيت المهمة"); setStatus("error"); return; }
        } catch (e) {
          if (myRound !== round.current) return;
          // 🔐 401/403 ليست انقطاعاً عابراً: التوكن منتهٍ أو المهمة لملك آخر
          if (e?.status === 401) { stopPolling(); setError("انتهت جلستك — سجّل الدخول لمتابعة المهمة"); setStatus("error"); return; }
          if (e?.status === 403) { stopPolling(); setError("هذه المهمة لا تخصّ حسابك"); setStatus("error"); return; }
          if (e?.status === 404) { stopPolling(); setError("المهمة لم تعد موجودة على السيرفر"); setStatus("error"); return; }
          fails += 1;
          if (fails >= MAX_POLL_FAILS) {
            stopPolling();
            setError("تعذّر متابعة التحميل بعد عدة محاولات — قد يكون الاتصال غير مستقر");
            setStatus("error");
            return;
          }
        }
        if (Date.now() - startedAt > MAX_POLL_MS) {
          stopPolling();
          setError("تجاوز الاستطلاع الحد الزمني — حالة المهمة غير مؤكدة، جرّب صفحة السجل");
          setStatus("error");
          return;
        }
        timer.current = setTimeout(tick, POLL_MS);
      };
      timer.current = setTimeout(tick, POLL_MS);
      return res;
    } catch (e) {
      if (myRound !== round.current) return null;
      setError(e.message || "فشل بدء التحميل");
      setStatus("error");
      return null;
    }
  }, [stopPolling]);

  /** ❌ إلغاء مهمة جارية */
  const cancel = useCallback(async () => {
    if (!jobId.current) return;
    stopPolling();
    try { await cancelJob(jobId.current); } catch {}
    setError("أُلغيت المهمة");
    setStatus("error");
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    jobId.current = null;
    setStatus("idle"); setInfo(null); setJob(null); setProgress(0); setStage(""); setError("");
  }, [stopPolling]);

  return { status, info, job, progress, stage, error, fetchInfo, download, cancel, reset };
}
