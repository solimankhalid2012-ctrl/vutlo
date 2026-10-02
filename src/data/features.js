/**
 * قائمة الميزات — مصدر واحد تستهلكه صفحتا Home و Features.
 *
 * ⚠️ سبب وجود الملف: كانت كل صفحة تحتفظ بنسختها، فظهرت ادعاءات
 * غير منفَّذة (مساعد AI، تطبيق PWA) بلغة واحدة فقط، بينما تعلن
 * الأخرى غيرها. الآن أي تصحيح هنا يسري على الصفحتين معاً.
 *
 * الشكل: [أيقونة, عنوان, وصف, قيد التطوير؟]
 *   قيد التطوير = 1 ⇒ تُعرض بشارة "قريباً" ولا تُحسب في "متاح الآن".
 * قاعدة الصدق: لا تُعلن ميزة كـ live إلا نفّذها الكود فعلاً.
 */
export const FEATURES = {
  ar: [
    ["🚫", "بدون علامة مائية", "TikTok وReels وShorts بجودة أصلية", 0],
    ["🎧", "MP3 بجودة 320kbps", "استخراج الصوت بنقرة واحدة", 0],
    ["📃", "قوائم التشغيل", "تحميل Playlist كاملة بضغطة واحدة", 0],
    ["📡", "تحميل القنوات", "أرشفة قناة كاملة عبر Playlist", 0],
    ["✂️", "قص قبل التحميل", "Trim & Download لأي مقطع", 0],
    ["💬", "دمج الترجمة", "دمج ملفات الترجمة في الفيديو", 0],
    ["🎞️", "تحويل إلى GIF", "مقاطع متحركة من أي فيديو", 0],
    ["🗜️", "ضغط الفيديو", "تصغير الحجم بدون فقدان ملحوظ", 0],
    ["🔄", "تحويل الصيغ", "MP4 ↔ MKV ↔ WEBM ↔ AVI", 0],
    ["🧵", "16 خيط متوازٍ", "أقصى سرعة عبر تنزيل متوازٍ", 0],
    ["⏸️", "استئناف التحميل", "متابعة الملف الناقص بعد الانقطاع", 0],
    ["📁", "مدير تحميلات", "تتبّع حي لكل مهمة", 0],
    ["☁️", "سجل محفوظ", "محلياً، وسحابياً إذا سجّلت الدخول", 0],
    ["🔗", "مشاركة الرابط", "أرسل رابط الفيديو من جهازك", 0],
    ["📱", "رمز QR", "صورة رمز لكل فيديو محمَّل", 0],
    ["🌙", "ليلي / نهاري", "اختر الوضعين يدوياً", 0],
    ["🔑", "روابط محمية", "دعم كلمة سر الفيديو", 0],
    ["⏰", "جدولة التحميلات", "نفّذ التحميل في وقت لاحق", 0],
    ["🧑‍💻", "API عام", "REST موثّق للمطورين", 0],
    ["✈️", "بوت Telegram", "حمّل من داخل المحادثة", 0],
    ["🌍", "10 لغات", "ترجمة كاملة + RTL", 0],
    ["📲", "تطبيق PWA", "تثبيت الموقع كتطبيق", 1],
    ["🤖", "مساعد AI", "اقتراح أفضل جودة لجهازك", 1],
    ["🔔", "تنبيهات فورية", "إشعار عند اكتمال التحميل", 1],
    ["🏆", "نقاط ومكافآت", "للمستخدمين النشطين", 1],
    ["💬", "بوت WhatsApp", "تحميل عبر واتساب", 1],
    ["🕵️", "أرشيف ذكي", "نسخ احتياطية للروابط", 1],
  ],
  en: [
    ["🚫", "No watermark", "TikTok, Reels & Shorts in original quality", 0],
    ["🎧", "320kbps MP3", "One-click audio extraction", 0],
    ["📃", "Playlists", "Whole playlist in one click", 0],
    ["📡", "Channels", "Archive a full channel as a playlist", 0],
    ["✂️", "Trim & download", "Cut any segment first", 0],
    ["💬", "Subtitle merge", "Merge subtitle files into the video", 0],
    ["🎞️", "GIF maker", "Animated clips from video", 0],
    ["🗜️", "Compressor", "Smaller size, same look", 0],
    ["🔄", "Format convert", "MP4 ↔ MKV ↔ WEBM ↔ AVI", 0],
    ["🧵", "16 threads", "Max-speed parallel fetch", 0],
    ["⏸️", "Auto-resume", "Continue an incomplete file after drops", 0],
    ["📁", "Download manager", "Live per-job tracking", 0],
    ["☁️", "Saved history", "On this device, and in the cloud when signed in", 0],
    ["🔗", "Share link", "Send the video link from your device", 0],
    ["📱", "QR code", "A scannable image per downloaded video", 0],
    ["🌙", "Dark / light", "Pick either theme, manually", 0],
    ["🔑", "Password links", "Protected videos OK", 0],
    ["⏰", "Scheduler", "Run downloads later", 0],
    ["🧑‍💻", "Public API", "Documented REST for developers", 0],
    ["✈️", "Telegram bot", "Download in-chat", 0],
    ["🌍", "10 languages", "Full i18n + RTL", 0],
    ["📲", "PWA app", "Install the site as an app", 1],
    ["🤖", "AI assistant", "Suggests the best quality for your device", 1],
    ["🔔", "Push alerts", "Notify on completion", 1],
    ["🏆", "Points & rewards", "For active users", 1],
    ["💬", "WhatsApp bot", "Download via chat", 1],
    ["🕵️", "Smart archive", "Link backups", 1],
  ],
};

/** قائمة بلغة معيّنة مع fallback إنجليزي لبقية اللغات. */
export const featureList = (lang) => FEATURES[lang] || FEATURES.en;

/** المتاح فعلاً الآن فقط (بدون "قريباً"). */
export const liveFeatures = (lang) => featureList(lang).filter((f) => !f[3]);
