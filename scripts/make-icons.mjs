/**
 * توليد أيقونات PNG للتطبيق والـmanifest.
 *
 * ⚠️ لماذا: manifest كان يعلن SVG فقط ⇒ Chrome لا счита التطبيق قابلاً
 * للتثبيت بدون أيقونتي 192 و512 بصيغة PNG. كما ينقص apple-touch-icon
 * لأجهزة iOS (تستخدم favicon.ico/SVG ⇒ أيقونة فارغة في الشاشة الرئيسية).
 *
 * بلا مكتبات صور ⇒ نرسم الشعار (دائرة + مثلث تشغيل) بمعادلات رياضية
 * عبر مُرمِّز PNG في scripts/lib/png.mjs.
 *
 * التشغيل: node scripts/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, mix } from "./lib/png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VOID = [10, 14, 10];
const EMERALD = [16, 185, 129];
const MINT = [52, 211, 153];

/** رسم الأيقونة: تدرّج + حلقة + مثلث تشغيل، نسباً لحجم الصورة */
const draw = (size) => {
  const c = size / 2;
  const rOuter = size * 0.46;
  const rInner = size * 0.38;
  const triW = size * 0.26; // نص قطر المثلث
  const triH = size * 0.32; // نصف الارتفاع

  return (x, y) => {
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c;
    const r = Math.hypot(dx, dy);
    const t = (x / size) * 0.6 + (y / size) * 0.4;
    let col = mix(VOID, [8, 46, 34], Math.min(1, t));

    // حلقة خضراء
    if (r <= rOuter && r >= rInner) col = mix(col, EMERALD, 0.95);
    // تعبئة داخل الحلقة
    if (r < rInner) col = mix(col, [10, 30, 22], 0.85);
    // مثلث تشغيل (يبدأ من المركز قليلاً ل optical centering)
    const px = dx + triW * 0.25;
    if (r <= rInner - size * 0.03 && px >= -triW / 2 && px <= triW / 2) {
      const edge = (1 - (px + triW / 2) / triW) * triH;
      if (Math.abs(dy) <= edge) col = mix(col, MINT, 0.95);
    }
    return col;
  };
};

const targets = [
  [16, "icon-16.png"], [32, "icon-32.png"], [48, "icon-48.png"], [72, "icon-72.png"],
  [96, "icon-96.png"], [128, "icon-128.png"], [144, "icon-144.png"], [152, "icon-152.png"],
  [180, "apple-touch-icon.png"], [192, "icon-192.png"], [384, "icon-384.png"], [512, "icon-512.png"],
];

mkdirSync(join(ROOT, "public"), { recursive: true });
for (const [size, name] of targets) {
  const buf = encodePng(size, size, draw(size));
  writeFileSync(join(ROOT, "public", name), buf);
  console.log(`✔ public/${name}  ${size}×${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
