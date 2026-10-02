// validators
export const isValidUrl = (u = "") => {
  const raw = String(u).trim();
  if (!raw) return false;
  try {
    // ⚠️ raw.startsWith("http") حسّاس لحالة الأحرف ⇒ "HTTP://x.com" كانت تُعامل
    // كنص بلا بروتوكول وتُضاف له "https://" فتصير رابطاً مشوّهاً.
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const x = new URL(withProto);
    if (!/^https?:$/.test(x.protocol)) return false;
    return x.hostname.includes(".");
  } catch {
    return false;
  }
};

/** الروابط المحمية بكلمة سر (yt-dlp --video-password) */
export const isPasswordProtected = (u = "") => /[?&](pass|password|pwd)=|\/passcode\//i.test(String(u));
