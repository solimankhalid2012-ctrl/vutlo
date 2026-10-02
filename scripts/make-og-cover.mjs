/**
 * توليد public/og-cover.png (1200×630) — صورة المشاركة الاجتماعية.
 *
 * ⚠️ لماذا سكربت لا ملف جاهز: index.html كان يشير إلى /og-cover.png
 * والملف غير موجود ⇒ كل مشاركة على X/WhatsApp/Telegram بلا صورة،
 * وconsole 404 عند كل تحميل للصفحة.
 *
 * بلا مكتبات صور (sharp/canvas غير مثبّتة) ⇒ نكتب PNG يدوياً:
 * تدرّج لوني + شعار تشغيل + شريط سفلي. فقط zlib المدمجة في Node.
 *
 * التشغيل: node scripts/make-og-cover.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, mix } from "./lib/png.mjs";

const W = 1200;
const H = 630;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og-cover.png");

// لوحة ألوان الهوية (نفس tailwind: void/emerald/mint)
const VOID = [10, 14, 10];
const EMERALD = [16, 185, 129];
const MINT = [52, 211, 153];

/** تدرّج قطري من deep-space إلى أخضر خافت */
function background(x, y) {
  const t = Math.min(1, (x / W) * 0.55 + (y / H) * 0.45);
  return mix(VOID, [8, 46, 34], t);
}

/** مربّع داخل المربّع بدالة مسافة (أقرب SDF ⇒ الحواف أنعم) */
const inBox = (x, y, x0, y0, x1, y1, soft = 2) => {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return Math.max(dx, dy) <= soft ? 1 : 0;
};

/** مثلث مشغّل داخل دائرة = زر تشغيل الشعار */
function inPlayGlyph(x, y) {
  const cx = 600;
  const cy = 268;
  const r = Math.hypot(x - cx, y - cy);
  if (r > 108) return 0;
  const [px, py] = [x - cx, y - cy];
  // مثلث متساوي الساقين متجه لليمين
  if (px >= -46 && px <= 56 && Math.abs(py) <= (1 - (px + 46) / 102) * 62) return 1;
  return r > 96 && r <= 108 ? 1 : 0; // حلقة
}

const shade = (x, y) => {
  let c = background(x, y);

  // شريط سفلي (شريط "علامة" بصرية بدل نص)
  if (y > H - 54) c = mix(c, EMERALD, 0.85);
  if (inBox(x, y, 0, 0, W, 6) || inBox(x, y, 0, H - 7, W, H)) c = EMERALD;
  if (inPlayGlyph(x, y)) c = mix(c, MINT, 0.95);

  return c;
};

const png = encodePng(W, H, shade);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`✔ og-cover.png written: ${W}×${H}, ${(png.length / 1024).toFixed(1)} KB`);
