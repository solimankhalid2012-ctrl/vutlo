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
    formats: ["mp4", "webm", "mkv"],
    qualities: true,
    label: { ar: "فيديو", en: "Video" },
    hint: {
      ar: "تنزيل الفيديو بجودة تصل إلى 8K",
      en: "Download the video up to 8K",
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
export const GIF_DEFAULT = { start: 0, duration: 4, width: 480 };
