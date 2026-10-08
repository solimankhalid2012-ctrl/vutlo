import { QUALITIES, FORMATS } from "../utils/detectors.js";

/**
 * الأدوات المتاحة قبل التحميل — كل ما يمكن للمستخدم فعله، في مكان واحد.
 * kind: ما الذي يفعله الخادم فعلياً (format بدل video/mp3/gif)
 * post: معالجة لاحقة بـ FFmpeg بعد انتهاء التحميل (compress)
 */
export const TOOLS = [
  {
    id: "video",
    icon: "🎬",
    kind: "video",
    // mp3 هنا أيضاً: نفس رابط الفيديو، لكن المستخدم يستخرج الصوت مباشرة
    // (yt-dlp: -f ba/b -x --audio-format mp3 --audio-quality 320K) بلا
    // تنزيل الفيديو كاملاً ثم تحويله.
    formats: ["mp4", "mp3", "webm", "mkv"],
    qualities: true,
    label: { ar: "فيديو", en: "Video" },
    hint: {
      ar: "تنزيل الفيديو بجودة تصل إلى 8K — أو الصوت فقط MP3",
      en: "Download the video up to 8K — or audio only as MP3",
    },
  },
  {
    id: "audio",
    icon: "🎧",
    kind: "audio",
    formats: ["mp3"],
    qualities: false,
    label: { ar: "صوت MP3", en: "MP3 Audio" },
    hint: {
      ar: "صوت فقط بجودة 320kbps — بلا فيديو، أسرع 10×",
      en: "Audio only at 320kbps — no video, ~10× faster",
    },
  },
  {
    id: "gif",
    icon: "🎞️",
    kind: "gif",
    formats: ["gif"],
    qualities: false,
    gifOptions: true,
    label: { ar: "صورة GIF", en: "GIF" },
    hint: {
      ar: "مقطع متحرك من أي جزء من الفيديو",
      en: "Animated clip from any part of the video",
    },
  },
  {
    id: "compress",
    icon: "🗜️",
    kind: "video",
    post: "compress",
    formats: ["mp4", "webm", "mkv"],
    qualities: true,
    label: { ar: "ضغط", en: "Compress" },
    hint: {
      ar: "تنزيل ثم ضغط لملف أصغر مع FFmpeg",
      en: "Download then shrink the file size with FFmpeg",
    },
  },
  {
    id: "playlist",
    icon: "📃",
    kind: "playlist",
    label: { ar: "قائمة تشغيل", en: "Playlist" },
    hint: {
      ar: "قائمة تشغيل أو قناة كاملة — حدّد الفيديوهات ثم نزّلها كلها",
      en: "A whole playlist or channel — pick videos then download them all",
    },
  },
  {
    id: "schedule",
    icon: "⏰",
    kind: "schedule",
    label: { ar: "جدولة", en: "Schedule" },
    hint: {
      ar: "أجّل التنزيل لوقت لاحق — يعمل حتى لو أغلقت المتصفح",
      en: "Queue the download for later — works even if you close the browser",
    },
  },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];

/** الصيغ المتاحة لأداة معيّنة */
export const formatsFor = (toolId) => {
  const tool = toolById(toolId);
  return FORMATS.filter((f) => tool.formats?.includes(f.id));
};

/** الجودات: الأدوات بلا جودة (صوت/GIF) ترث الجودة الافتراضية فقط */
export const qualitiesFor = (toolId) => (toolById(toolId).qualities ? QUALITIES : ["best"]);

/** الأداة -> الصيغة التي تُرسل للخادم */
export const formatForTool = (toolId, chosen) => {
  const tool = toolById(toolId);
  const first = tool.formats?.[0] || "mp4";
  if (tool.kind === "video") return chosen && tool.formats.includes(chosen) ? chosen : first;
  return first;
};

/** GIF لا يتجاوز 480p داخلياً (لحجم معقول) */
export const GIF_MAX_HEIGHT = 480;

/** ⚙️ خيارات GIF — القيم الافتراضية تطابق clampGifArgs في الخادم.
 *  speed: معامل تسريع (2 = ضعف السرعة), loop: 0 = تكرار لا نهائي */
export const GIF_DEFAULT = { start: 0, duration: 4, width: 480, fps: 12, dither: "bayer", bayerScale: 2, loop: 0, speed: 1 };

/** نطاقات العرض في الواجهة (الخادم يقصّ 120–720) */
export const GIF_WIDTHS = [240, 320, 360, 480, 640, 720];
export const GIF_FPS = [8, 10, 12, 15, 20, 25];
export const GIF_SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];
export const GIF_DITHERERS = [
  { id: "none", ar: "بلا تدرّج (أصغر حجماً)", en: "No dither (smaller)" },
  { id: "bayer", ar: "ناعم (Bayer)", en: "Smooth (Bayer)" },
  { id: "bayer", scale: 5, ar: "أنعم (Bayer 5×5)", en: "Smoother (Bayer 5×5)" },
  { id: "sierra2", ar: "توازن (Sierra 2)", en: "Balanced (Sierra 2)" },
  { id: "sierra2_4a", ar: "سريع وخفيف (Sierra Lite)", en: "Fast light (Sierra Lite)" },
  { id: "floyd_steinberg", ar: "حِدّة أعلى (Floyd)", en: "Sharper (Floyd)" },
  { id: "sierra3", ar: "تدرّج عميق (Sierra 3)", en: "Deep gradient (Sierra 3)" },
  { id: "burkes", ar: "ناعم جداً (Burkes)", en: "Very smooth (Burkes)" },
  { id: "atkinson", ar: "توازن حِدّة/نعومة (Atkinson)", en: "Balanced (Atkinson)" },
  { id: "heckbert", ar: "انتشار بسيط (Heckbert)", en: "Simple diffusion (Heckbert)" },
];

/** مجموعات جاهزة بنقرة واحدة — أشهر استخدامات GIF */
export const GIF_PRESETS = [
  { id: "reaction", ar: "ردة فعل 3s", en: "Reaction 3s", opts: { start: 0, duration: 3, width: 480, fps: 15, speed: 1, loop: 0, dither: "bayer" } },
  { id: "loop", ar: "تكرار 6s هادئ", en: "Smooth loop 6s", opts: { start: 0, duration: 6, width: 360, fps: 12, speed: 0.75, loop: 0, dither: "sierra2" } },
  { id: "square", ar: "مربّع 320 خفيف", en: "Square 320 light", opts: { start: 0, duration: 4, width: 320, fps: 10, speed: 1, loop: 0, dither: "bayer" } },
  { id: "slowmo", ar: "حركة بطيئة 2×", en: "Slow-mo 0.5×", opts: { start: 0, duration: 4, width: 480, fps: 20, speed: 0.5, loop: 1, dither: "bayer" } },
  { id: "fast", ar: "سريع 2× خفيف", en: "Fast 2× light", opts: { start: 0, duration: 4, width: 360, fps: 12, speed: 2, loop: 0, dither: "none" } },
];

/** تقريب الأرقام للـ slider/المدخلات الرقمية (عائم⇒لا NaN في الواجهة) */
export const gifNumber = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
