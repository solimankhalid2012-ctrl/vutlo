/**
 * مُرمِّز PNG مصغّر بلا تبعيات (نستخدم zlib المدمجة فقط).
 * موجود لأن المشروع لا يشمل sharp/canvas، وكان لذلك مفقود كل أيقونات PNG
 * التي يحتاجها manifest لتثبيت التطبيق على Chrome (SVG غير مقبول).
 */
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/**
 * يبني PNG truecolor من دالة رسم.
 * @param {number} w العرض
 * @param {number} h الارتفاع
 * @param {(x:number,y:number)=>[number,number,number]} shade لون البكسل (RGB)
 * @returns {Buffer}
 */
export function encodePng(w, h, shade) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = shade(x, y);
      const i = (y * w + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
  // كل سطر مسبوق ببايت نوع الترشيح (0 = none)
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y += 1) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // عمق البت
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
