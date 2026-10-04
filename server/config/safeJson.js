/**
 * قراءة JSON من رد خارجي (Telegram / WhatsApp / أي HTTP) دون رمي استثناء.
 *
 * السبب: response.json() يرمي SyntaxError إن كان الرد فارغاً أو مبتوراً
 * (نفس خطأ "Unexpected end of JSON input"). الاستدعاءات هنا ملفوفة بـcatch،
 * لكن الرد الفارغ كان يمرّ كخطأ غير متوقع بدل نتيجة هادئة.
 *
 * @param {Response} res       الرد من fetch
 * @param {*} fallback          ما يُعاد عند الفشل (افتراضياً {})
 */
export async function safeJson(res, fallback = {}) {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
