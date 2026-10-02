// ── JWT guard للوحة الإدارة + توكن المستخدمين ──
// السر من config/security.js (مصدر واحد) — لا قيم افتراضية هنا إطلاقاً.
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_ALG, ADMIN_PASS_HASH, ADMIN_PASS_PLAIN, PROD } from "../config/security.js";
import { verifyPassword, safeEqual } from "../config/passwords.js";

const BASE = { algorithm: JWT_ALG };

export function signAdmin(email) {
  return jwt.sign({ email, role: "admin" }, JWT_SECRET, { ...BASE, expiresIn: "12h" });
}

/** توكن مستخدم عادي (نقاط + مزامنة) */
export function signUser(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role || "user" }, JWT_SECRET, { ...BASE, expiresIn: "30d" });
}

function readBearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** هل يوجد توكن في الطلب أصلاً؟ (لتمييز "زائر" عن "توكن منتهٍ/مزوّر") */
export const hasBearer = (req) => !!readBearer(req);

/** تحقق اختياري — لا يفشل بدون توكن (يُستخدم لنقاط/الخطة) */
export function tryUser(req) {
  const token = readBearer(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
  } catch {
    return null;
  }
}

/** حارس مستخدم (user أو admin) */
export function requireUser(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized — توكن غير صالح" });
  }
}

export function requireAdmin(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: "Unauthorized — سجّل الدخول" });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
    if (payload.role !== "admin") throw new Error("not admin");
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized — توكن غير صالح" });
  }
}

/**
 * التحقق من كلمة سر الأدمن.
 * - المفضّل: ADMIN_PASS_HASH (scrypt) — لا تُخزَّن الكلمة الصريحة إطلاقاً.
 * - للتطوير فقط: ADMIN_PASS_PLAIN للمقارنة.
 * - في الإنتاج بلا hash ⇒ يرفض (مفروض أن يكون resolveSecret قد أوقف الإقلاع أصلاً).
 */
export function verifyAdminPassword(password = "") {
  if (ADMIN_PASS_HASH) return verifyPassword(password, ADMIN_PASS_HASH).ok;
  if (PROD || !ADMIN_PASS_PLAIN) return false;
  return safeEqual(String(password), String(ADMIN_PASS_PLAIN));
}
