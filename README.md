# ⚡ Vutlo — Smart Video Downloader

أداة تحميل فيديو Utility: الصق رابطاً من **1000+ موقع** (YouTube, TikTok, Instagram,
Facebook, X, Vimeo, Twitch, Reddit, Pinterest, Snapchat, LinkedIn, Dailymotion, SoundCloud…)
→ كشف محلي فوري → معاينة + اختيار الجودة **144p → 8K** والصيغة
**(MP4 / MP3 320kbps / WEBM / MKV / GIF)** → تحميل **بدون علامة مائية** ✨

> أداة Utility — وليست شبكة اجتماعية. بدون منشورات/متابعين. مع إشعارات DMCA وحقوق نشر واضحة.

## 📁 الموقع على جهازك

```
C:\Users\PC\Desktop\videovault-pro
```

## 🚀 التشغيل

```powershell
cd "C:\Users\PC\Desktop\videovault-pro"
npm install
# كل شيء في نافذة واحدة (موصى به):
npm run dev:all
# أو في طرفية منفصلة:
npm run dev      # الواجهة على 5173
npm run server   # الباكند على 4001
```

ثم افتح: <http://localhost:5173> — الـAPI على <http://localhost:4001>

> المنفذ يأتي من `.env` (`PORT=4001`) ويطابقه `vite.config.js` الذي يوجّه
> `/api` و`/files` إلى `4001`. الافتراضي في `server.js` هو `4001` أيضاً.
> إن غيّرت المنفذ، غيّره في المكانين.

### متطلّبات التشغيل

- Node 20+ (تم التطوير والاختبار على `v24.18.0`)
- `yt-dlp` و`ffmpeg` في `PATH`، أو اضبط `YTDLP_BIN` و`FFMPEG_PATH` في `.env`
- قاعدة البيانات: SQLite عبر Prisma — `DATABASE_URL=file:./dev.db` (لا تحتاج Postgres)

> PWA: **غير مثبَّت بعد** — لا يوجد service worker، لذا التثبيت كتطبيق غير متاح
> على Chrome. ملف `manifest.json` والأيقونات جاهزة، والناقص هو
> `vite-plugin-pwa` (أو service worker يدوي). لذلك لا تُعلن الصفحة PWA كميزة متاحة.

## 🧠 محرّك التعرّف على الروابط

- الملف: `src/utils/detectors.js` — Regex محلّي بالكامل (بلا طلب شبكة)
- 13 منصة أساسية + fallback عام لأي رابط يدعمه yt-dlp
- `guessThumbnail()` تجلب صورة YouTube مباشرة، والباقي عبر `POST /api/info`
- `suggestQuality()` اختيار جودة حسب سرعة الشبكة (ليس نموذج ذكاء اصطناعي)

## 🌍 اللغات (10)

`ar, en, he, fr, es, de, tr, fa, ur, id` — التبديل فوري بدون reload، وRTL تلقائي
(`ar/he/fa/ur`)، والحفظ في LocalStorage + Cookie، واكتشاف لغة المتصفح.
**كل اللغات العشر مكتملة** (119 مفتاحاً لكل ملف، مُتحقَّق منها في `tests/locales.test.js`).
لغة غير مدعومة في التخزين ⇒ يعود تلقائياً إلى العربية بدل كسر المفاتيح.

## 💰 الإعلانات

**لا توجد إعلانات.** الموقع ad-free، و`public/ads.txt` يحتوي تعليقات فقط بلا
معرّفات وهمية. للعودة للإعلانات: ضع معرّف AdSense الحقيقي في `ads.txt`، وأضف
`VITE_ADSENSE_CLIENT`، وأضف بنية `<ins class="adsbygoogle">` في الصفحات المطلوبة.
(ملف `ads.txt` بمعرّف غير مطابق لحساب حقيقي قد يؤدّي إلى تعليق حساب AdSense.)

## 🛠️ الباكند

- `server/server.js` — Express + Helmet + CORS + RateLimit
  (`API_MAX_PER_MIN=120` عام، `HEAVY_MAX_PER_MIN=15` للعمليات الثقيلة،
  `LOGIN_MAX_ATTEMPTS=5/15min` للدخول، `CONTACT_MAX_PER_HOUR=5`)
- `server/services/ytdlpService.js` — `yt-dlp` للمعاينة والتحميل
  (حتى 16 خيطاً، retries، MP3 بجودة 320kbps، `--continue` للاستئناف)
- `server/services/ffmpegService.js` — التحويل/الضغط/GIF مع طابور محدود
  (`MAX_FFMPEG=2` متوازٍ، و`FFMPEG_MAX_WAITING=6` منتظر، والباقي يُرفض بخطأ واضح)
- `server/services/db.js` — SQLite عبر Prisma (وضع الذاكرة ما زال متاحاً
  بـ`DB_MODE=memory` للاختبارات فقط). **السجل دائم بالفعل**، وليس في الذاكرة.
- `MAX_CONCURRENT=4` لعمليات yt-dlp المتزامنة، والمهام مرتبطة بمالكها
  (`Download.userId` / `ScheduledTask.userId`) ولا تُعرض إلا لمالكها.

## 📚 التوثيق

- `docs/API.md` — مرجع الـREST API
- `GET /api/docs` — نفس المرجع كـJSON من السيرفر نفسه (لا يتقادم مع الكود)
- `SECURITY.md` — سياسة الإبلاغ ونقاط القوة

## 📦 النشر

- الواجهة: **Vercel** — `npm run build` → مجلد `dist`
- الباكند: **Railway / Render** — الأمر `npm run server` (ثبّت `yt-dlp` + `ffmpeg` على السيرفر)
- أضِف `VITE_SITE_URL=https://vutlo.onrender.com` في بيئة Render/Vercel
- متغيّرات مطلوبة على السيرفر: أسرار `.env` كلها (راجع `.env.example`)،
  و`ADMIN_PASS_HASH` بصيغة scrypt
- روابط الملفات النسبية `/files/...` تُحوَّل لمطلقة تلقائياً في الواجهة
  عند ضبط `VITE_API_URL` (عبر `fileUrl()` في `src/services/api.js`)

## 🖼️ توليد الأصول

```bash
node scripts/make-icons.mjs      # أيقونات PNG (16…512) + apple-touch-icon
node scripts/make-og-cover.mjs   # صورة المشاركة 1200×630
```

بلا تبعيات خارجية (المُرمِّز في `scripts/lib/png.mjs`).

## ⚖️ قانوني

حمّل فقط ما تملكه أو ما هو مرخّص لك. صفحات Privacy/Terms/DMCA موجودة —
راجع محامياً قبل الإطلاق العام. لا نستضيف أي محتوى.

## 📌 حالة الأدوات (بدل قائمة "القادم" الوهمية)

| الأداة | الحالة |
| --- | --- |
| بوت Telegram | ✅ يعمل (webhook secret + allow-list + throttle) |
| بوت WhatsApp | ⚠️ يحتاج توكن Meta حقيقياً وسلوك توقيع POST |
| PWA / تثبيت كتطبيق | ❌ بلا service worker |
| QR | ⚠️ عبر `api.qrserver.com` (يرسل الرابط لطرف ثالث) |
| مساعد AI | ❌ غير منفَّذ (لا يُعلن كميزة متاحة) |
| رفع لـ R2/S3 | ❌ الملفات محلية على القرص |
| SSE للتقدّم | ❌ polling كل 1.5s |
