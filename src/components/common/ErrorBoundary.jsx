import React from "react";
import { reportRenderError } from "../../utils/errorReporter.js";

/**
 * حارس الأخطاء: يمنع أي خطأ غير متوقع من تحويل الموقع إلى شاشة بيضاء.
 * يعرض رسالة مفهومة مع زر إعادة المحاولة، ويسجّل الخطأ في الكونسول للمطور.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: "" };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info: String(info?.componentStack || "").slice(0, 400) });
    console.error("[ErrorBoundary]", error, info);
    // ⚠️ كان يطبع في الكونسول فقط ⇒ خطأ رندر لا يصلنا إطلاقاً ولا نعرف أي صفحة تكسر.
    reportRenderError(error, info?.componentStack || "");
  }

  reset = () => {
    this.setState({ error: null, info: "" });
    this.props.onReset?.();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    // نرث اتجاه المستند (يضبطه LangContext على <html>) بدل فرض RTL على كل اللغات
    const dir = typeof document !== "undefined" ? document.documentElement.dir || "ltr" : "ltr";
    const ar = dir === "rtl";
    const txt = ar
      ? {
          title: "حدث خطأ غير متوقع",
          body: "الموقع واجه مشكلة أثناء عرض هذه الصفحة. بياناتك محفوظة — جرّب إعادة المحاولة، وإن تكرّر الخطأ أرسل لنا التفاصيل بالزر بالأسفل.",
          details: "التفاصيل التقنية",
          retry: "إعادة المحاولة",
          home: "الصفحة الرئيسية",
          copy: "نسخ التفاصيل",
        }
      : {
          title: "Something went wrong",
          body: "The site hit an unexpected error while rendering this page. Your data is safe — try again, and if it keeps happening send us the details below.",
          details: "Technical details",
          retry: "Try again",
          home: "Home",
          copy: "Copy details",
        };

    return (
      // ⚠️ bg-void-950 غير موجود في Tailwind ⇒ الخلفية تبقى شفافة وتظهر صفحة بيضاء
      // في الوضع الفاتح. bg-slate-950 existe دائماً في Tailwind القياسي.
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center" dir={dir}>
        <div className="card w-full max-w-lg p-8">
          <div className="text-5xl">🛠️</div>
          <h1 className="mt-4 text-2xl font-black text-white">{txt.title}</h1>
          <p className="mt-2 text-sm text-white/60">{txt.body}</p>

          <details className="mt-5 text-start text-xs text-white/45">
            <summary className="cursor-pointer font-bold">{txt.details}</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-white/80">
              {String(error?.message || error)}
              {info}
            </pre>
          </details>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={this.reset}>
              🔄 {txt.retry}
            </button>
            <a className="btn-ghost" href="/">
              🏠 {txt.home}
            </a>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const body = `Vutlo — UI error\n\n${String(error?.stack || error)}\n\n${info}`;
                navigator.clipboard?.writeText(body);
              }}
            >
              📋 {txt.copy}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
