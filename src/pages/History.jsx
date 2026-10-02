import React, { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import Modal from "../components/ui/Modal.jsx";
import { useLang } from "../context/LangContext.jsx";
import { getHistory } from "../services/api.js";

const readLocal = () => {
  try { return JSON.parse(localStorage.getItem("vv-history") || "[]"); }
  catch { return []; }
};

/**
 * History — سجل التحميلات السحابي
 * - يدمج السجل المحلي (vv-history) مع GET /api/history ويزيل التكرار حسب الرابط
 * - عمليات حقيقية: فتح • نسخ رابط مشاركة • QR • حذف عنصر • مسح الكل
 */
export default function History() {
  const { t, lang } = useLang();
  const [items, setItems] = useState([]);
  const [qr, setQr] = useState(null); // العنصر المعروض في نافذة QR
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const local = readLocal();
    try {
      const cloud = await getHistory();
      // دمج + إزالة تكرار حسب url
      const seen = new Set();
      const merged = [...local, ...(Array.isArray(cloud) ? cloud : [])].filter((x) => {
        if (!x?.url || seen.has(x.url)) return false;
        seen.add(x.url);
        return true;
      });
      setItems(merged);
    } catch {
      setItems(local); // وضع عدم الاتصال: المحلي فقط
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const removeOne = (url) => {
    const next = items.filter((x) => x.url !== url);
    setItems(next);
    try { localStorage.setItem("vv-history", JSON.stringify(next)); } catch {}
  };

  const clearAll = () => {
    setItems([]);
    try { localStorage.setItem("vv-history", "[]"); } catch {}
  };

  const shareLink = async (url) => {
    // مشاركة الرابط الحقيقي (أو نسخه) — بدون روابط وهمية
    try {
      if (navigator.share) {
        await navigator.share({ title: "VideoVault Pro", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      flash(t("history.copied"));
    } catch { flash(url); }
  };

  const fmtDate = (at) => {
    try { return new Date(at).toLocaleString(lang); }
    catch { return ""; }
  };

  return (
    <>
      <Helmet>
        <title>{t("history.title")} — VideoVault Pro</title>
        <meta name="description" content={t("history.subtitle")} />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">{t("history.title")}</h1>
            <p className="mt-2 text-white/60">
              {t("history.subtitle")} • <span className="chip">{items.length} {t("history.count")}</span>
            </p>
          </div>
          {items.length > 0 && (
            <button onClick={clearAll} className="btn-ghost !py-2 text-sm">{t("history.clear")}</button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="card mt-6 p-10 text-center">
            <div className="text-5xl">🕘</div>
            <p className="mt-3 text-white/60">{t("history.empty")}</p>
            <a href="/" className="btn-primary mt-4">⚡ {t("nav.home")}</a>
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {items.map((x, i) => (
              /* المفتاح لا يكون الرابط وحده: نفس الفيديو قد يُنزَّل أكثر من مرة */
              <div key={`${x.id || x.url}-${i}`} className="card !p-3 flex items-center gap-3">
                <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-void-700 text-2xl">
                  {x.thumb ? <img src={x.thumb} alt="" className="h-full w-full object-cover" /> : "🎬"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{x.title || x.url}</div>
                  <div className="truncate text-xs text-white/40" dir="ltr">{x.url}</div>
                  {x.at && <div className="text-[11px] text-white/35">{fmtDate(x.at)}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <a href={x.url} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">
                    {t("history.open")}
                  </a>
                  <button onClick={() => shareLink(x.url)} className="btn-ghost !px-3 !py-1.5 text-xs">
                    🔗 {t("history.share")}
                  </button>
                  <button onClick={() => setQr(x)} className="btn-ghost !px-3 !py-1.5 text-xs">
                    📱 {t("history.qr")}
                  </button>
                  <button onClick={() => removeOne(x.url)} className="btn-ghost !px-3 !py-1.5 text-xs !border-red-500/40 !text-red-300">
                    {t("history.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* نافذة QR لكل فيديو */}
      <Modal open={!!qr} onClose={() => setQr(null)}>
        <div className="text-center">
          <h3 className="font-black">📱 QR Code</h3>
          <p className="mt-1 truncate text-xs text-white/50" dir="ltr">{qr?.url}</p>
          {qr && (
            <img
              /* تنبيه: هذه الخدمة تستقبل رابط الفيديو كاملاً في طلبها.
                 referrerPolicy="no-referrer" يقلّل كشف بيانات إضافية،
                 والحل الصحيح هو توليد الرمز محلياً على جهازك بلا خدمة خارجية. */
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr.url)}`}
              alt="QR code"
              className="mx-auto mt-4 rounded-2xl border border-white/10"
              width={200}
              height={200}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={(e) => {
                // فشل الخدمة الخارجية ⇒ أخبر المستخدم بدل صورة مكسورة
                e.currentTarget.style.display = "none";
                setToast(t("history.qrFailed") || "تعذّر توليد رمز QR — انسخ الرابط بدل ذلك");
              }}
            />
          )}
          <button onClick={() => setQr(null)} className="btn-primary mt-4 w-full">{t("history.open")} ✓</button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 start-1/2 -translate-x-1/2 rounded-2xl bg-emerald px-5 py-3 font-bold text-void shadow-glow">
          {toast}
        </div>
      )}
      <Footer />
    </>
  );
}
