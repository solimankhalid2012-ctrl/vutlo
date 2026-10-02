// ─────────────────────────────────────────────
// config/trustProxy.js — استخراج عنوان العميل الحقيقي للقرارات الأمنية
//
// الثغرة (مثبتة بالاختبار الحيّ وبقراءة مصدر proxy-addr):
//   forwarded() يبني addrs = [socket, ...قيمة X-Forwarded-For بالترتيب]،
//   وalladdrs يقصّ من اليسار عند أول قفزة غير موثوقة ويعيد *آخر* عنصر.
//   مع trust proxy = 1 خلف nginx يستعمل proxy_add_x_forwarded_for، //   الترويسة تصير: "<ما أرسله المهاجم>, <عنوان العميل الحقيقي>" أي
//   addrs = [127.0.0.1, "9.9.9.9(مزوَّر)", "real"] ⇒ req.ip = "9.9.9.9".
//   ⇒ كل طلب بترويسة مزوّرة يحصل على سجلّ حدود نظيف، فتُعطَّل كل الحدود.
//
//   و"loopback" لا تنفع: التزوير يقع على يسار القفزة الموثوقة، فيُقصّ بعده
//   فيعود المزوَّر إلىreq.ip أيضاً.
//
// الحل: لا نثق بإعداد جاهز، بل نأخذ من الطرف الأيمن عدداً محدداً من العناصر.
// الـproxy الحقيقي يضع عنوان العميل الصحيح في الطرف الأيمن دائماً
// (سواء ضاعف الترويسة أو استبدلها)، وما يرسله العميل يبقى على يسارها.
// نأخذ فقط trustedHops عنصراً من اليمين ونهمل ما قبلها.
// ─────────────────────────────────────────────

/** كم قفزة proxy موثوقة أمام السيرفر. الافتراضي 0 = لا نثق بأي ترويسة. */
export function resolveTrustedHops(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v === "false" || v === "no" || v === "0") return 0;
  // loopback = proxy محلي واحد (nginx على نفس الجهاز) وهو setupsنا المقترح
  if (v === "loopback" || v === "true" || v === "yes") return 1;
  if (/^\d+$/.test(v)) return Math.min(Number(v), 10); // سقف: someone's رشّح عناوين كثيرة بلا فائدة
  return 0; // قيمة غير مفهومة ⇒ لا نثق (fail-closed)
}

/** عنوان العميل كما يجب أن تراه حدود الطلبات والسجل. */
export function clientIpFromRequest(req, hops) {
  const socketIp = req?.socket?.remoteAddress || "";
  if (!hops) return socketIp; // لا proxy ⇒ العنوان الفعلي وحده
  const header = req?.headers?.["x-forwarded-for"];
  const list = String(header || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return socketIp; // لا ترويسة ⇒ لا proxy افترضناه
  // نأخذ العنصر hops من اليمين؛ إن لم يوجد (proxy fewer منhops) نأخذ الأيمن
  const idx = list.length - hops;
  return (idx >= 0 ? list[idx] : list[list.length - 1]) || socketIp;
}