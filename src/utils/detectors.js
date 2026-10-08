// ─────────────────────────────────────────────
// Smart Link Recognition Engine — محرك كشف الروابط الذكي
// الهدف: كشف المنصة خلال < 500ms + استخراج IDs + اقتراح الجودة
// ─────────────────────────────────────────────

/** قائمة المنصات المدعومة (13 أساسية + دعم عام لـ 1000+ عبر yt-dlp) */
export const PLATFORMS = [
  { id: "youtube", name: "YouTube", color: "#FF0000", icon: "▶️",
    patterns: [/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch|shorts|live|embed|playlist)|youtu\.be\/)/i] },
  { id: "tiktok", name: "TikTok", color: "#FE2C55", icon: "🎵",
    patterns: [/^(https?:\/\/)?(www\.|m\.|vm\.|vt\.)?tiktok\.com\//i] },
  { id: "instagram", name: "Instagram", color: "#E1306C", icon: "📸",
    patterns: [/^(https?:\/\/)?(www\.)?instagram\.com\/(reel|reels|p|tv|stories)\//i] },
  { id: "facebook", name: "Facebook", color: "#1877F2", icon: "📘",
    patterns: [/^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com|fb\.watch|fb\.com)\//i] },
  { id: "twitter", name: "X (Twitter)", color: "#E7E9EA", icon: "𝕏",
    patterns: [/^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\//i] },
  { id: "vimeo", name: "Vimeo", color: "#1AB7EA", icon: "🎬",
    patterns: [/^(https?:\/\/)?(www\.|player\.)?vimeo\.com\//i] },
  { id: "twitch", name: "Twitch", color: "#9146FF", icon: "🎮",
    patterns: [/^(https?:\/\/)?(www\.|m\.)?twitch\.tv\//i] },
  { id: "reddit", name: "Reddit", color: "#FF4500", icon: "🤖",
    patterns: [/^(https?:\/\/)?(www\.|old\.|m\.)?reddit\.com\//i, /^(https?:\/\/)?v\.redd\.it\//i] },
  { id: "pinterest", name: "Pinterest", color: "#E60023", icon: "📌",
    patterns: [/^(https?:\/\/)?(www\.)?pinterest\.[a-z.]+\/pin\//i] },
  { id: "soundcloud", name: "SoundCloud", color: "#FF5500", icon: "🎧",
    patterns: [/^(https?:\/\/)?(www\.|m\.)?(soundcloud\.com|on\.soundcloud\.com)\//i] },
  { id: "dailymotion", name: "Dailymotion", color: "#00AAFF", icon: "📺",
    patterns: [/^(https?:\/\/)?(www\.)?(dailymotion\.com|dai\.ly)\//i] },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2", icon: "💼",
    patterns: [/^(https?:\/\/)?(www\.)?linkedin\.com\/(posts|feed|video)\//i] },
  { id: "snapchat", name: "Snapchat", color: "#FFFC00", icon: "👻",
    patterns: [/^(https?:\/\/)?(www\.)?snapchat\.com\//i, /^(https?:\/\/)?snap\.chat\//i] },
];

/** كشف سريع — يجب أن يتم خلال < 500ms (فعلياً < 5ms، كله Regex محلي) */
export function detectPlatform(url) {
  const t0 = performance.now?.() ?? Date.now();
  const clean = (url || "").trim();
  if (!clean) return { platform: null, ms: 0 };

  // رابط غير صالح أساساً؟
  let isUrl = false;
  try {
    const u = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    isUrl = !!u.hostname.includes(".");
  } catch { isUrl = false; }

  for (const p of PLATFORMS) {
    if (p.patterns.some((re) => re.test(clean))) {
      const ms = (performance.now?.() ?? Date.now()) - t0;
      return { platform: p, ms: Math.round(ms * 100) / 100, isUrl, videoId: extractVideoId(clean, p.id) };
    }
  }
  // fallback: رابط عام → yt-dlp يدعم 1000+ موقع
  const ms = (performance.now?.() ?? Date.now()) - t0;
  if (isUrl) {
    return {
      platform: { id: "generic", name: "رابط عام (1000+ موقع)", color: "#0DBE68", icon: "🔗" },
      ms: Math.round(ms * 100) / 100, isUrl, videoId: null,
    };
  }
  return { platform: null, ms: Math.round(ms * 100) / 100, isUrl: false, videoId: null };
}

/** استخراج معرف الفيديو حسب المنصة (للمعاينة والـ thumbnail) */
export function extractVideoId(url, platformId) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (platformId === "youtube") {
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split(/[?/]/)[0];
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
      return u.searchParams.get("v");
    }
    if (platformId === "tiktok") {
      const m = u.pathname.match(/\/video\/(\d+)/);
      return m?.[1] ?? null;
    }
    if (platformId === "instagram") {
      const m = u.pathname.match(/\/(reel|reels|p|tv)\/([^/?#]+)/);
      return m?.[2] ?? null;
    }
    if (platformId === "vimeo") {
      const m = u.pathname.match(/\/(\d+)/);
      return m?.[1] ?? null;
    }
    return null;
  } catch { return null; }
}

/** صورة المعاينة المتوقعة (YouTube لها thumbnail مباشر، الباقي عبر API) */
export function guessThumbnail(url, platformId, videoId) {
  if (platformId === "youtube" && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return null; // الباقي يأتي من POST /api/info في الباكند
}

/** هل هذه المنصة تُزال علامتها المائية تلقائياً؟ */
export function supportsNoWatermark(platformId) {
  return ["tiktok", "instagram", "youtube", "twitter", "facebook"].includes(platformId);
}

/** مساعد AI: اقتراح أفضل جودة حسب نوع الشبكة (بسيط وقابل للتوسعة) */
export function suggestQuality({ saveData = false, effectiveType = "4g" } = {}) {
  if (saveData) return "720p";
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "360p";
  if (effectiveType === "3g") return "720p";
  return "1080p"; // 4g / wifi
}

export const QUALITIES = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p (4K)", "4320p (8K)"];
export const FORMATS = [
  { id: "mp4", label: "MP4 — فيديو", desc: "الأكثر توافقاً" },
  { id: "mp3", label: "MP3 — صوت 320kbps", desc: "استخراج الصوت" },
  { id: "webm", label: "WEBM — ويب", desc: "حجم أصغر" },
  { id: "mkv", label: "MKV — جودة قصوى", desc: "للأرشفة" },
  { id: "gif", label: "GIF — متحرك", desc: "مقطع قصير" },
];
