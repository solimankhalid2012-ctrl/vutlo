/* ══════════════════════════════════════════════════════════════════════════
   shared/fileScan.js — ماسح الملفات الذكي 🔬
   ──────────────────────────────────────────────────────────────────────────
   وحدة واحدة تعمل في المتصفح (Vite) وفي السيرفر (Node ESM) بلا أي اعتماديات.

   ماذا يفعل؟
   ① يقرأ **التوقيع السحري** (magic bytes) أول 256KB ⇒ الصيغة الحقيقية للملف،
      لا الامتداد الذي يزعمه المستخدم (invoice.pdf.exe ملف تنفيذي!).
   ② يميّز **لغة البرمجة** من الامتداد أو من shebang السطر الأول.
   ③ يجمع **درجة خطورة** 0..100 مع سبب مكتوب لكل ملاحظة:
      امتداد مزدوج، تنفيذ مُقنَّع بصورة، ماكرو، سكربت، SVG يحمل <script>،
      أرشيف يحوي تنفيذيات، محتوى مشفّر/عالي الانتروبيا، عدم تطابق التوقيع
      مع الامتداد، ملف متعدد الصيغ (polyglot)، ونصيحة EICAR.
   ④ يعطي verdict: safe | caution | danger.

   ملاحظة أمنية: هذا فحص هيكلي/إحصائي (、御 signatures + entropy)،
   ليس بديلاً عن مضاد فيروسات كامل — والرسالة تقول ذلك للمستخدم.
   ══════════════════════════════════════════════════════════════════════════ */

/** أقصى بايتات نقرأها لكل ملف (يكفي لكل التواقيع + Entropy) */
export const SCAN_HEAD_BYTES = 262144; // 256KB

/* ── أدوات بايت خالصة ───────────────────────────────────────────────── */

const at = (b, i) => (i >= 0 && i < b.length ? b[i] : 0);
const has = (b, off, arr) => {
  if (off + arr.length > b.length) return false;
  for (let i = 0; i < arr.length; i++) if (b[off + i] !== arr[i]) return false;
  return true;
};
const asciiAt = (b, off, len) => {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = at(b, off + i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
};
const decode = (b, len = 8192) => {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, len));
  } catch {
    return asciiAt(b, 0, Math.min(len, 2048));
  }
};

/** نص بايت صغير (للـEICAR) */
const latin1 = (b, len = 2048) => {
  let s = "";
  for (let i = 0; i < Math.min(len, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
};

/** شانون إنتروبيا بالبت على العيّنة (0..8) — الملفات المبلّغة/المشفّرة قريبة من 8 */
export function entropy(b) {
  if (!b || !b.length) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < b.length; i++) counts[b[i]]++;
  let h = 0;
  const n = b.length;
  for (let i = 0; i < 256; i++) {
    if (!counts[i]) continue;
    const p = counts[i] / n;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 1000) / 1000;
}

/* ── التوقيعات السحرية: نطاقات broad لكل صيغة ───────────────────────────
   test(bytes) → bool. أول تطابق يفوز (الترتيب = الأولوية: الأدق أولاً). */
const S = (ext, kind, mime, ar, en, test, note = "") => ({ ext, kind, mime, ar, en, test, note });

export const SIGNATURES = [
  // ── تنفيذية (أخطر ما يمكن أن يحمله ملف) ──
  S("exe", "executable", "application/x-msdownload", "ملف تنفيذي لويندوز", "Windows executable",
    (b) => has(b, 0, [0x4d, 0x5a]), "ترويسة MZ"),
  S("dll", "executable", "application/x-msdownload", "مكتبة DLL", "DLL library",
    (b) => has(b, 0, [0x4d, 0x5a])),
  S("elf", "executable", "application/x-executable", "ملف تنفيذي لينكس", "ELF executable",
    (b) => has(b, 0, [0x7f, 0x45, 0x4c, 0x46]), "ترويسة \\x7FELF"),
  S("macho", "executable", "application/x-mach-binary", "ملف تنفيذي macOS/iOS", "Mach-O binary",
    (b) => has(b, 0, [0xfe, 0xed, 0xfa]) || has(b, 0, [0xcf, 0xfa, 0xed, 0xfe]) || has(b, 0, [0xca, 0xfe, 0xba, 0xbe])),
  S("class", "executable", "application/java-vm", "كود جافا مترجم", "Java class",
    (b) => has(b, 0, [0xca, 0xfe, 0xba, 0xbe]) && at(b, 7) === 0x00),
  S("dex", "executable", "application/octet-stream", "ملف Dalvik (أندرويد)", "Dalvik DEX",
    (b) => asciiAt(b, 0, 4) === "dex\n"),
  S("wasm", "executable", "application/wasm", "وحدة WebAssembly", "WebAssembly module",
    (b) => has(b, 0, [0x00, 0x61, 0x73, 0x6d])),
  S("apk", "archive", "application/vnd.android.package-archive", "حزمة أندرويد APK", "Android package",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /AndroidManifest/.test(latin1(b, 4096))),
  S("msi", "executable", "application/x-msi", "حزمة تثبيت ويندوز", "Windows installer",
    (b) => has(b, 0, [0xd0, 0xcf, 0x11, 0xe0])),

  // ── صور ──
  S("png", "image", "image/png", "صورة PNG", "PNG image",
    (b) => has(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  S("jpg", "image", "image/jpeg", "صورة JPEG", "JPEG image",
    (b) => has(b, 0, [0xff, 0xd8, 0xff]) && has(b, 2, [0xff])),
  S("gif", "image", "image/gif", "صورة GIF", "GIF image",
    (b) => asciiAt(b, 0, 6) === "GIF87a" || asciiAt(b, 0, 6) === "GIF89a"),
  S("webp", "image", "image/webp", "صورة WebP", "WebP image",
    (b) => asciiAt(b, 0, 4) === "RIFF" && asciiAt(b, 8, 4) === "WEBP"),
  S("bmp", "image", "image/bmp", "صورة BMP", "BMP image", (b) => has(b, 0, [0x42, 0x4d])),
  S("tiff", "image", "image/tiff", "صورة TIFF", "TIFF image",
    (b) => has(b, 0, [0x49, 0x49, 0x2a, 0x00]) || has(b, 0, [0x4d, 0x4d, 0x00, 0x2a])),
  S("ico", "image", "image/x-icon", "أيقونة ICO", "ICO icon",
    (b) => has(b, 0, [0x00, 0x00, 0x01, 0x00]) || has(b, 0, [0x00, 0x00, 0x02, 0x00])),
  S("heic", "image", "image/heic", "صورة HEIC (آيفون)", "HEIC image",
    (b) => asciiAt(b, 4, 4) === "ftyp" && /heic|heix|mif1/.test(asciiAt(b, 8, 8))),
  S("avif", "image", "image/avif", "صورة AVIF", "AVIF image",
    (b) => asciiAt(b, 4, 4) === "ftyp" && /avif|mif1/.test(asciiAt(b, 8, 8))),
  S("svg", "image", "image/svg+xml", "صورة SVG (نص)", "SVG vector image",
    (b) => /^\s*(<\?xml|<!DOCTYPE svg|<svg)/i.test(decode(b, 512))),
  S("psd", "image", "image/vnd.adobe.photoshop", "ملف فوتوشوب PSD", "Photoshop PSD",
    (b) => has(b, 0, [0x38, 0x42, 0x50, 0x53])),

  // ── فيديو ──
  S("mp4", "video", "video/mp4", "فيديو MP4", "MP4 video",
    (b) => asciiAt(b, 4, 4) === "ftyp", "حاوية ISO-BMFF"),
  S("mov", "video", "video/quicktime", "فيديو QuickTime", "QuickTime video",
    (b) => asciiAt(b, 4, 4) === "ftyp" && /qt/.test(asciiAt(b, 8, 4))),
  S("m4v", "video", "video/x-m4v", "فيديو M4V", "M4V video",
    (b) => asciiAt(b, 4, 4) === "ftyp"),
  S("3gp", "video", "video/3gpp", "فيديو 3GP", "3GP video",
    (b) => asciiAt(b, 4, 4) === "ftyp" && /3gp/.test(asciiAt(b, 8, 8))),
  S("webm", "video", "video/webm", "فيديو WebM/MKV", "WebM/Matroska video",
    (b) => has(b, 0, [0x1a, 0x45, 0xdf, 0xa3]), "EBML"),
  S("mkv", "video", "video/x-matroska", "فيديو Matroska", "Matroska video",
    (b) => has(b, 0, [0x1a, 0x45, 0xdf, 0xa3])),
  S("flv", "video", "video/x-flv", "فيديو FLV", "Flash video", (b) => has(b, 0, [0x46, 0x4c, 0x56, 0x01])),
  S("avi", "video", "video/x-msvideo", "فيديو AVI", "AVI video",
    (b) => has(b, 0, [0x52, 0x49, 0x46, 0x46]) && asciiAt(b, 8, 4) === "AVI "),
  S("wmv", "video", "video/x-ms-wmv", "فيديو WMV", "WMV video",
    (b) => has(b, 0, [0x30, 0x26, 0xb2, 0x75])),
  S("mpeg", "video", "video/mpeg", "فيديو MPEG", "MPEG video", (b) => has(b, 0, [0x00, 0x00, 0x01, 0xba])),

  // ── صوت ──
  S("mp3", "audio", "audio/mpeg", "صوت MP3", "MP3 audio",
    (b) => asciiAt(b, 0, 3) === "ID3" || (has(b, 0, [0xff, 0xfb]) && (b[1] & 0xe0) === 0xe0)),
  S("wav", "audio", "audio/wav", "صوت WAV", "WAV audio",
    (b) => has(b, 0, [0x52, 0x49, 0x46, 0x46]) && asciiAt(b, 8, 4) === "WAVE"),
  S("flac", "audio", "audio/flac", "صوت FLAC", "FLAC audio", (b) => asciiAt(b, 0, 4) === "fLaC"),
  S("ogg", "audio", "audio/ogg", "صوت OGG", "OGG audio", (b) => asciiAt(b, 0, 4) === "OggS"),
  S("aac", "audio", "audio/aac", "صوت AAC", "AAC audio", (b) => has(b, 0, [0xff, 0xf1]) || has(b, 0, [0xff, 0xf9])),
  S("m4a", "audio", "audio/mp4", "صوت M4A", "M4A audio",
    (b) => asciiAt(b, 4, 4) === "ftyp" && /M4A/.test(asciiAt(b, 8, 8))),
  S("opus", "audio", "audio/opus", "صوت Opus", "Opus audio",
    (b) => asciiAt(b, 0, 8) === "OggS" && /OPUS/.test(latin1(b, 128))),
  S("mid", "audio", "audio/midi", "ملف MIDI", "MIDI audio", (b) => asciiAt(b, 0, 4) === "MThd"),

  // ── أرشيف ──
  S("zip", "archive", "application/zip", "أرشيف ZIP", "ZIP archive",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) || has(b, 0, [0x50, 0x4b, 0x05, 0x06]), "ترويسة PK"),
  S("gz", "archive", "application/gzip", "أرشيف GZIP", "GZIP archive", (b) => has(b, 0, [0x1f, 0x8b])),
  S("bz2", "archive", "application/x-bzip2", "أرشيف BZIP2", "BZIP2 archive", (b) => has(b, 0, [0x42, 0x5a, 0x68])),
  S("xz", "archive", "application/x-xz", "أرشيف XZ", "XZ archive", (b) => has(b, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])),
  S("zst", "archive", "application/zstd", "أرشيف Zstandard", "Zstandard archive",
    (b) => has(b, 0, [0x28, 0xb5, 0x2f, 0xfd])),
  S("7z", "archive", "application/x-7z-compressed", "أرشيف 7-Zip", "7-Zip archive", (b) => has(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])),
  S("rar", "archive", "application/vnd.rar", "أرشيف RAR", "RAR archive", (b) => has(b, 0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])),
  S("tar", "archive", "application/x-tar", "أرشيف TAR", "TAR archive", (b) => asciiAt(b, 257, 5) === "ustar"),
  S("iso", "system", "application/x-iso9660-image", "صورة قرص ISO", "ISO disk image",
    (b) => has(b, 0x8001, [0x43, 0x44, 0x30, 0x31]) || asciiAt(b, 32769, 5) === "CD001"),

  // ── مستندات ──
  S("pdf", "document", "application/pdf", "مستند PDF", "PDF document", (b) => asciiAt(b, 0, 5) === "%PDF-"),
  S("rtf", "document", "application/rtf", "مستند RTF", "RTF document", (b) => asciiAt(b, 0, 5) === "{\\rtf"),
  S("docx", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "مستند Word (docx)", "Word document",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /word\//.test(latin1(b, 4096))),
  S("docm", "document", "application/vnd.ms-word.document.macroEnabled.12",
    "مستند Word بماكرو", "Word document with macros",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /word\//.test(latin1(b, 4096)) && /vbaProject/i.test(latin1(b, 8192))),
  S("xlsx", "document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "جدول Excel (xlsx)", "Excel workbook",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /xl\//.test(latin1(b, 4096))),
  S("xlsm", "document", "application/vnd.ms-excel.sheet.macroEnabled.12",
    "جدول Excel بماكرو", "Excel workbook with macros",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /xl\//.test(latin1(b, 4096)) && /vbaProject/i.test(latin1(b, 8192))),
  S("pptx", "document", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "عرض PowerPoint", "PowerPoint deck",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /ppt\//.test(latin1(b, 4096))),
  S("pptm", "document", "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    "عرض PowerPoint بماكرو", "PowerPoint deck with macros",
    (b) => has(b, 0, [0x50, 0x4b, 0x03, 0x04]) && /ppt\//.test(latin1(b, 4096)) && /vbaProject/i.test(latin1(b, 8192))),
  S("doc", "document", "application/msword", "مستند Word قديم", "Legacy Word document",
    (b) => has(b, 0, [0xd0, 0xcf, 0x11, 0xe0])),
  S("sqlite", "data", "application/vnd.sqlite3", "قاعدة بيانات SQLite", "SQLite database",
    (b) => asciiAt(b, 0, 15) === "SQLite format 3"),

  // ── خطوط ──
  S("ttf", "font", "font/ttf", "خط TrueType", "TrueType font",
    (b) => has(b, 0, [0x00, 0x01, 0x00, 0x00, 0x00]) || asciiAt(b, 0, 4) === "true"),
  S("otf", "font", "font/otf", "خط OpenType", "OpenType font", (b) => asciiAt(b, 0, 4) === "OTTO"),
  S("woff", "font", "font/woff", "خط WOFF", "WOFF font", (b) => asciiAt(b, 0, 4) === "wOFF"),
  S("woff2", "font", "font/woff2", "خط WOFF2", "WOFF2 font", (b) => asciiAt(b, 0, 4) === "wOF2"),

  // ── نصوص/كود ──
  S("html", "code", "text/html", "صفحة HTML", "HTML page",
    (b) => /^\s*(<!DOCTYPE html|<html|<head|<body)/i.test(decode(b, 512))),
  S("json", "code", "application/json", "ملف JSON", "JSON data",
    (b) => /^\s*[[{]/.test(decode(b, 64))),
  S("xml", "code", "application/xml", "ملف XML", "XML data", (b) => /^\s*<\?xml/i.test(decode(b, 128))),
];

/* ── الامتدادات الخطرة (تُرفض عند الرفع ولا تُفتح inline) ───────────────── */
export const DANGEROUS_EXTS = new Set([
  "exe", "dll", "scr", "pif", "cpl", "msi", "com", "sys", "drv", "ocx", "cpl",
  "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "hta",
  "js", "mjs", "cjs", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm",
  "iso", "img", "vhd", "vhdx", "mdf", "reg", "lnk", "url", "chm", "shs",
  "swf", "xll", "mdb", "accde", "psdxml", "one", "pub", "jnlp", "apk", "xapk",
]);

/** امتدادات المستندات ذات الماكرو (خطرة: VBA ينفّذ كوداً) */
export const MACRO_EXTS = new Set(["docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam", "xlsb"]);

/** سكربتات قابلة للتنفيذ — خطورة متوسطة (ليست تنفيذية مباشرة) */
export const SCRIPT_EXTS = new Set(["sh", "bash", "zsh", "py", "rb", "pl", "php", "ps1", "bat", "cmd", "vbs", "lua", "r", "tcl"]);

/** صيغ لا تُعرض inline على نطاق موقعنا (XSS مخزَّن) */
export const NEVER_INLINE = new Set(["html", "htm", "xhtml", "svg", "xml", "js", "mjs", "json", "css", "swf", "xsl"]);

/** ⚠️ صيغ ينفّذها **الخادم** (CGI/PHP/ASP/JSP/…) — خطرة على أي استضافة CGI.
 *  Express يقدّمها كملف ساكن هنا، لكن الرابط دائم وقد يُربط بين بيئات. */
export const SERVER_EXEC_EXTS = new Set([
  "php", "php3", "php4", "php5", "php7", "php8", "phps", "phtml", "pht", "phar",
  "asp", "aspx", "ascx", "ashx", "asmx", "axd", "cer",
  "jsp", "jspx", "jspa", "jsw", "jsv", "jhtml",
  "cfm", "cfc", "cfml", "shtml", "shtm", "ssi", "cgi", "fcgi",
  "pl", "pm", "rb", "rhtml", "erb", "lua", "tcl", "wscript", "cscript",
  "shtml", "xht", "mht", "mhtml", "hta", "htaccess", "htpasswd", "user", "ini", "conf",
  "sh", "bash", "zsh", "ksh", "csh", "bat", "cmd", "ps1", "vbs",
]);

/** بايتات اختبار EICAR القياسية (سلاسل AV) — نكتشفها ونرفض الرفع */
export const EICAR_RE = /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!/;

/* ── خريطة الامتداد: النوع + اللغة ──────────────────────────────────────── */
export const EXT_INFO = {
  // برمجة
  js: ["code", "JavaScript"], mjs: ["code", "JavaScript"], cjs: ["code", "JavaScript"],
  jsx: ["code", "JavaScript (React)"], ts: ["code", "TypeScript"], tsx: ["code", "TypeScript (React)"],
  py: ["code", "Python"], pyc: ["code", "Python (compiled)"], rb: ["code", "Ruby"], php: ["code", "PHP"],
  go: ["code", "Go"], rs: ["code", "Rust"], java: ["code", "Java"], kt: ["code", "Kotlin"],
  swift: ["code", "Swift"], c: ["code", "C"], h: ["code", "C/C++ header"], cpp: ["code", "C++"],
  cc: ["code", "C++"], hpp: ["code", "C++ header"], cs: ["code", "C#"], fs: ["code", "F#"],
  lua: ["code", "Lua"], pl: ["code", "Perl"], r: ["code", "R"], jl: ["code", "Julia"],
  dart: ["code", "Dart"], ex: ["code", "Elixir"], exs: ["code", "Elixir"], erl: ["code", "Erlang"],
  hs: ["code", "Haskell"], ml: ["code", "OCaml"], clj: ["code", "Clojure"], scala: ["code", "Scala"],
  groovy: ["code", "Groovy"], vue: ["code", "Vue"], svelte: ["code", "Svelte"],
  html: ["code", "HTML"], htm: ["code", "HTML"], css: ["code", "CSS"], scss: ["code", "Sass/SCSS"],
  json: ["code", "JSON"], xml: ["code", "XML"], yml: ["code", "YAML"], yaml: ["code", "YAML"],
  toml: ["code", "TOML"], ini: ["code", "INI"], sh: ["code", "Shell (Bash)"], bash: ["code", "Shell (Bash)"],
  ps1: ["code", "PowerShell"], bat: ["code", "Batch"], cmd: ["code", "Batch"], sql: ["code", "SQL"],
  md: ["document", "Markdown"], txt: ["document", "نص عادي"], log: ["document", "سجل نصي"],
  // بيانات
  csv: ["data", "CSV"], jsonl: ["data", "JSON Lines"], db: ["data", "قاعدة بيانات"], sqlite: ["data", "SQLite"],
  // مستندات
  doc: ["document", "Word (قديم)"], docx: ["document", "Word"], xls: ["document", "Excel (قديم)"],
  xlsx: ["document", "Excel"], ppt: ["document", "PowerPoint (قديم)"], pptx: ["document", "PowerPoint"],
  odt: ["document", "OpenDocument Text"], rtf: ["document", "RTF"], pdf: ["document", "PDF"], epub: ["document", "EPUB"],
};

/** نص/لغة من shebang السطر الأول — يكشف السكربتات بلا امتداد */
export function detectShebang(text) {
  const line = String(text || "").slice(0, 120);
  if (!/^#!/.test(line)) return null;
  if (/python/.test(line)) return "Python";
  if (/\b(bash|sh|zsh|dash)\b/.test(line)) return "Shell (Bash)";
  if (/\bnode\b/.test(line)) return "JavaScript (Node)";
  if (/\bruby\b/.test(line)) return "Ruby";
  if (/\bperl\b/.test(line)) return "Perl";
  if (/\bphp\b/.test(line)) return "PHP";
  if (/\blua\b/.test(line)) return "Lua";
  return "سكربت (shebang)";
}

/* ── استخراج الامتدادات ────────────────────────────────────────────────
   نرفض الأسماء المعقّدة: مسارات، NUL، محارف تحكّم، Unicode خفي. */
export function safeName(name) {
  return String(name || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/[\\/<>:"|?*]/g, "_")
    .replace(/^[.\s]+/, "")          // منع أسماء مثل .htaccess
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";
}

export function extsOf(name) {
  const base = safeName(name).split(".").slice(1);
  return base.filter(Boolean).map((e) => e.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** كل الامتدادات موجودة (للكشف عن الامتداد المزدوج) */
export function extList(name) {
  return extsOf(name);
}

/* ── الأوزان والسببات ─────────────────────────────────────────────────── */
const R = (id, weight, ar, en) => ({ id, weight, ar, en });

/**
 * الفحص الأساسي (نوع واحد: ArrayBuffer أو Uint8Array أو Buffer).
 * @param {object} f  { name, size, bytes }
 * @param {object} [opts] { sampleSize }
 * @returns تقرير كامل (انظر أعلى الملف)
 */
export function scan(f = {}) {
  const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || new ArrayBuffer(0));
  const name = safeName(f.name);
  const size = Number(f.size ?? bytes.length) || 0;
  const head = bytes.subarray(0, SCAN_HEAD_BYTES);
  const list = extList(name);
  const ext = list[list.length - 1] || "";
  const headText = decode(head, 1024);
  const rawText = latin1(head, 2048);
  const reasons = [];
  const add = (id, weight, ar, en) => reasons.push(R(id, weight, ar, en));

  /* ① الصيغة الحقيقية من التوقيع السحري
     نمرّ على الأنواع «المركّبة» أولاً (docx/epub/apk…) لأنها ترث توقيع ZIP،
     ولولا ذلك لأصبح كل ملف Office مجرد zip. */
  let sig = null;
  const CONTAINER_FIRST = ["apk", "docm", "docx", "xlsm", "xlsx", "pptm", "pptx", "epub"];
  for (const want of CONTAINER_FIRST) {
    const s = SIGNATURES.find((x) => x.ext === want);
    if (!s) continue;
    try { if (s.test(head)) { sig = s; break; } } catch { /* تجاهُل */ }
  }
  if (!sig) {
    for (const s of SIGNATURES) {
      try {
        if (s.test(head)) { sig = s; break; }
      } catch { /* توقيع غير متوافق مع حجم العيّنة */ }
    }
  }

  /* ② ما يقوله الامتداد */
  const info = EXT_INFO[ext] || null;
  const declaredKind = info ? info[0] : extKind(ext) || "unknown";
  const declaredLabel = info ? info[1] : null;
  const declaredLang = declaredKind === "code" ? declaredLabel : null;

  /* ③ اللغة: الامتداد ثم shebang */
  const shebang = detectShebang(headText);
  const language = declaredLang || shebang || null;

  /* ④ multi-format: does a benign file also carry a high-risk payload signature in its first 8KB?
     ⚠️ Warning level and not danger level: image data can contain any random byte,
     so blocking here would reject many legitimate images. The upload channel has a
        separate layer of protection: dangerous extensions are refused outright. */
  const RISKY_SIGS = ["exe", "elf", "macho", "dex", "class", "wasm"];
  const embeddedRisk = !sig || sig.kind !== "executable"
    ? RISKY_SIGS.map((e) => SIGNATURES.find((s) => s.ext === e))
        .filter((s) => {
          if (!s) return false;
          if (sig && s.ext === sig.ext) return false;
          try { return s.test(head.subarray(0, 8192)); } catch { return false; }
        })
    : [];
  const headIsContainer = !!(sig && ["zip", "docx", "xlsx", "pptx", "apk"].includes(sig.ext));

  /* ⑤ Entropy */
  const ent = entropy(head);

  /* ── القواعد ─────────────────────────────────────────────────────── */
  if (size === 0) add("empty", 40, "الملف فارغ تماماً", "File is empty");

  if (EICAR_RE.test(rawText)) add("eicar", 100, "يحتوي سلسلة اختبار EICAR (Program Files EICAR)", "Contains the EICAR antivirus test string");

  if (sig && sig.kind === "executable") {
    // exe/DLL صريح (الاسم يطابق المحتوى) ليس دليلاً على خبث — التنفيذيات
    // المشروعة موجودة بكثرة. الخطر الحقيقي هو الخداع (امتداد زائف/محتوى مخفي)؛
    // فالدرجة هنا «مراجعة» وتبقى «خطر» لما يجمع مؤشرات خداع فعلية (mismatch…).
    // MZ واحد يطابق exe وdll معاً ⇒ نعتبر أي امتداد تنفيذي صريحاً (لا تمييعاً).
    const honest = !!ext && (sig.ext === ext || extKind(ext) === "executable");
    if (honest) {
      add("executable", 40, `ملف تنفيذي فعلي (.${ext}) — لا تشغّله إلا من مصدر موثوق`, `Real executable (.${ext}) — run only from a trusted source`);
    } else {
      add("executable", 70, `محتوى تنفيذي فعلي (${sig.ar}) رغم الامتداد .${ext || "؟"}`, `Real executable content (${sig.en}) despite the .${ext || "?"} extension`);
    }
  }

  if (list.length >= 2 && DANGEROUS_EXTS.has(list[list.length - 1]) && !DANGEROUS_EXTS.has(list[0])) {
    add("doubleExt", 85, `امتداد مزدوج مضلِّل: .${list[0]} ثم .${list[list.length - 1]}`, `Deceptive double extension: .${list[0]} then .${list[list.length - 1]}`);
  }

  if (DANGEROUS_EXTS.has(ext) && !(sig && sig.kind === "executable")) {
    add("dangerExt", 70, `امتداد تنفيذ/خطير (.${ext}) لا يمكن التحقق منه بأمان`, `Dangerous extension (.${ext}) that cannot be verified as safe`);
  }

  if (MACRO_EXTS.has(ext)) add("macro", 55, `مستند يحتوي ماكرو (${ext.toUpperCase()}) قد ينفّذ كوداً`, `Macro-enabled document (${ext.toUpperCase()}) can run code`);

  if (SCRIPT_EXTS.has(ext)) add("script", 35, `سكربت قابل للتنفيذ (.${ext})`, `Executable script (.${ext})`);

  // عدم تطابق: التوقيع الحقيقي لا ينتمي لعائلة الامتداد
  const kindMatch = sig && (sig.kind === declaredKind || (sig.kind === "video" && declaredKind === "video") ||
    (sig.kind === "archive" && ["archive", "document", "data", "executable"].includes(declaredKind)) ||
    (sig.kind === "code" && ["code", "document", "data"].includes(declaredKind)) ||
    (sig.kind === "system" && ["archive", "data", "document"].includes(declaredKind)));
  if (sig && ext && declaredKind !== "unknown" && !kindMatch) {
    add("mismatch", 60, `المحتوى ${sig.ar} لا يطابق الامتداد .${ext}`, `Content is ${sig.en} but the extension claims .${ext}`);
  } else if (!sig && ext && !["code", "document", "data", "unknown"].includes(declaredKind)) {
    add("noSig", 25, `لم يُعرف أي توقيع سحري معروف لامتداد .${ext}`, `No known magic signature for the .${ext} extension`);
  }

  if (embeddedRisk.length) {
    const e0 = embeddedRisk[0];
    add("polyglot", 35, `يحتوي بايتات ${e0.ar} داخل أول 8KB (قد يكون حمولة مدفونة — تحقق قبل التشغيل)`, `Contains ${e0.en} bytes within the first 8KB (possible appended payload)`);
  }

  // SVG/HTML يحمل سكربتاً
  const isMarkup = sig && ["svg", "html", "xml"].includes(sig.ext);
  if (isMarkup && /<script|javascript:|on(load|error|click)\s*=/i.test(rawText)) {
    add("markupScript", 60, "ملف SVG/HTML يحتوي كوداً قابلاً للتنفيذ", "SVG/HTML file embeds executable code");
  }

  // أرشيف يحوي أسماء تنفيذيات/سكربتات
  if (headIsContainer || (sig && sig.ext === "zip")) {
    const names = rawText;
    if (/\.(exe|dll|scr|bat|cmd|ps1|vbs|js|hta|msi|com|jar|scr)\b/i.test(names)) {
      add("archiveExec", 45, "الأرشيف يحتوي ملفات تنفيذية أو سكربتات", "Archive contains executables or scripts");
    }
  }

  // نص مزدوج (NUL) مع امتداد نصي — نتجنّب الحاويات الثنائية التي تحوي NUL طبيعياً
  const BINARY_CONTAINERS = ["zip", "docx", "docm", "xlsx", "xlsm", "pptx", "pptm", "apk", "epub", "jar", "gzip", "7z", "rar", "exe", "elf", "macho", "dex", "class", "wasm", "sqlite"];
  if (["code", "document", "data"].includes(declaredKind) && head.includes(0) && !(sig && BINARY_CONTAINERS.includes(sig.ext))) {
    add("textBinary", 30, "ملف نصي يحتوي بايتات ثنائية (NUL)", "Text file contains binary NUL bytes");
  }

  // إنتروبيا عالية + امتداد تنفيذي/سكربت. التنفيذي الصريح (الاسم=المحتوى)
  // المعبّأ ليس وحده دليلاً على الخبث — كثير من مثبّتات البرامج المعروفة معبّأة.
  const honestExecutable = !!(sig && sig.kind === "executable" && ext && sig.ext === ext);
  if (ent > 7.6 && !honestExecutable && (DANGEROUS_EXTS.has(ext) || SCRIPT_EXTS.has(ext))) {
    add("packed", 35, `محتوى معبّأ/مشفّر (إنتروبيا ${ent}) — شائع في البرمجيات الخبيثة`, `Packed/encrypted content (entropy ${ent}) — common in malware`);
  } else if (ent > 7.9) {
    add("packedLow", 12, `إنتروبيا عالية جداً (${ent})`, `Very high entropy (${ent})`);
  }

  if (size > 500 * 1024 * 1024) add("huge", 15, "ملف أكبر من 500MB", "File larger than 500MB");

  /* ── النتيجة ─────────────────────────────────────────────────────── */
  const score = Math.min(100, reasons.reduce((s, r) => s + r.weight, 0));
  const verdict = score >= 70 ? "danger" : score >= 30 ? "caution" : "safe";
  const detectedLabel = sig ? { ar: sig.ar, en: sig.en } : declaredLabel ? { ar: declaredLabel, en: declaredLabel } : null;
  const blocked = verdict === "danger";

  const VERDICT_TEXT = {
    safe: { ar: "آمن — لا توجد مؤشرات خطر", en: "Safe — no risk indicators found" },
    caution: { ar: "يحتاج مراجعة — هناك مؤشرات تستدعي الحذر", en: "Needs review — indicators require caution" },
    danger: { ar: "خطر — لا ترفع/لا تشغّل هذا الملف", en: "Danger — do not upload or run this file" },
  };

  return {
    name,
    size,
    ext,
    exts: list,
    verdict,
    score,
    blocked,
    language,
    shebang: shebang || undefined,
    detected: sig
      ? { kind: sig.kind, ext: sig.ext, mime: sig.mime, label: { ar: sig.ar, en: sig.en }, by: "magic" }
      : { kind: declaredKind, ext: ext || null, mime: null, label: detectedLabel, by: ext ? "extension" : "none" },
    declared: { kind: declaredKind, label: declaredLabel, language: declaredLang },
    agreement: sig && ext ? (sig.ext === ext ? "match" : kindMatch ? "family" : "mismatch") : sig ? "magic-only" : "extension-only",
    entropy: ent,
    reasons,
    texts: VERDICT_TEXT[verdict],
    disclaimer: {
      ar: "هذا فحص هيكلي وإحصائي للتوقيعات والانتروبيا، وليس بديلاً عن مضاد فيروسات كامل.",
      en: "This is a structural/heuristic scan (signatures + entropy), not a full antivirus replacement.",
    },
  };
}

/** نوع الامتداد من خريطة التوقيعات إن لم يكن في EXT_INFO */
function extKind(ext) {
  if (!ext) return null;
  const s = SIGNATURES.find((x) => x.ext === ext);
  return s ? s.kind : null;
}

/** هل يُسمح برفع هذه الصيغة كملف عام؟ (يُمنع الخطير والـmarkup) */
export function canHost(fileName, report = null) {
  const ext = (extList(fileName).pop() || "").toLowerCase();
  if (!ext) return { ok: false, reason: { ar: "الملف بلا امتداد — لا يمكن تحديد نوعه", en: "No extension — cannot determine the type" } };
  if (DANGEROUS_EXTS.has(ext)) return { ok: false, reason: { ar: `امتداد .${ext} ممنوع للرفع (تنفيذ/سكربت)`, en: `Extension .${ext} is not allowed (executable/script)` } };
  if (SERVER_EXEC_EXTS.has(ext)) return { ok: false, reason: { ar: `امتداد .${ext} ينفَّذه الخادم — ممنوع للرفع`, en: `Extension .${ext} is executed by the server — upload blocked` } };
  if (NEVER_INLINE.has(ext)) return { ok: false, reason: { ar: `امتداد .${ext} يُنفَّذ داخل المتصفح — نمنعه حفاظاً على أمان الموقع`, en: `Extension .${ext} executes in the browser — blocked to keep the site safe` } };
  if (report && report.verdict === "danger") {
    return { ok: false, reason: { ar: "الفحص كشف محتوى خطر (تنفيذ مخفي/امتداد مزدوج)", en: "The scan found dangerous content (hidden executable / double extension)" } };
  }
  return { ok: true };
}

/** هل يُعرض الملف inline في المتصفح أم كملف تنزيل؟ */
export function serveMode(ext) {
  const e = String(ext || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "mp4", "webm", "mov", "m4v", "mp3", "wav", "ogg", "pdf", "txt"].includes(e)) {
    return "inline";
  }
  return "attachment";
}

export default scan;