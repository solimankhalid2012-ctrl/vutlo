# 🧑‍💻 VideoVault Pro — Public REST API v1.1.0

Base URL (dev): `http://localhost:4001/api` — فهرس تفاعلي حي: `GET /api/docs`
(يُولَّد من نفس تعريفات السيرفر، فلا يتقادم مع الكود)

كل الأجسام JSON. الحد الأقصى لحجم الجسم `256kb`.

## الحدود (rate limits)

| النطاق | الحد الافتراضي | المتغيّر |
| --- | --- | --- |
| `/api/*` | 120 / دقيقة | `API_MAX_PER_MIN` |
| `/api/info`, `/download`, `/playlist` | 15 / دقيقة | `HEAVY_MAX_PER_MIN` |
| `/api/auth/*`, `/api/admin/login` | 5 / 15 دقيقة | `LOGIN_MAX_ATTEMPTS` |
| `/api/contact` | 5 / ساعة | `CONTACT_MAX_PER_HOUR` |
| بوتات Webhooks | 60 / دقيقة | `WEBHOOK_MAX_PER_MIN` |

## المصادقة والصلاحيات

- `Authorization: Bearer <token>` — توكن من `POST /api/auth/login` أو `/register`
- **المهام الخاصة** (`/api/job/:id`, `DELETE`, `/api/convert|compress|gif`)
  تتطلّب توكن صاحب المهمة. زائر بلا توكن يرى `401`، ومهمة غير مملوكة `403`.
- **الجودة**: Free حتى `1080p`، وPro (أو الأدمن) حتى `8K`. الجودة الأعلى `402`.
- خطأ `401` يعني توكناً منتهياً/خاطئاً، و`403` يعني مهمة ليست لك — الفرق مقصود.

## 1) معاينة الفيديو

```http
POST /api/info
{ "url": "https://www.youtube.com/watch?v=…" }
```
→ `{ id, title, uploader, duration, durationSec, thumbnail, extractor, formats[] }`

## 2) بدء تحميل (مهمة yt-dlp حقيقية)

```http
POST /api/download
{
  "url": "string (required)",
  "quality": "144p|240p|360p|480p|720p|1080p|1440p|2160p|4320p",
  "format": "mp4|mp3|webm|mkv|gif",
  "password": "optional (protected videos)",
  "trimStart": "optional seconds",
  "trimEnd": "optional seconds",
  "subs": false,
  "threads": 8            // 1-16
}
```
→ `{ jobId, status: "queued", quality, format, message }`

ملاحظات: `mp3` يستخرج صوتاً 320kbps • القصّ عبر `--download-sections` •
`threads` تتحول إلى `--concurrent-fragments 1-16` • `--continue` للاستئناف.
التنفيذ فعلياً في الخلفية بعد إرجاع الرد (الحد الأقصى `MAX_CONCURRENT=4` متزامنة).

## 3) حالة المهمة

```http
GET /api/job/:id
```
→ `{ jobId, status: "queued|downloading|done|error|cancelled", progress: 0-100, fileUrl, fileName, size, error }`

`userId` لا يظهر في الرد أبداً (يُصفّى في `publicJob()`).
`fileUrl` نسبي (`/files/…`) — في الواجهة يتحوّل لمطلق عبر `fileUrl()`.

## 4) قائمة تشغيل / قناة

```http
POST /api/playlist
{ "url": "playlist or channel URL" }
```
→ `{ title, count, entries: [{ id, title, url, duration }] }`

## 5) الجدولة

```http
POST /api/schedule
{ "url": "string", "runAt": "2026-09-28T10:00:00.000Z", "quality": "1080p", "format": "mp4" }

GET    /api/schedules     # صاحب التوكن: مهامه فقط. الزائر: []
DELETE /api/schedule/:id  # المالك أو الأدمن فقط
```

الحد الأقصى 30 يوماً مقدماً. المهمة المنفَّذة ترث `userId` الخاص بالجدولة،
فيلكها صاحبها ويستطيع متابعتها. القائمة مرتّبة حسب وقت التنفيذ.

## 6) أدوات FFmpeg (تحتاج `jobId` منتهية)

```http
POST /api/convert   { "jobId": "job_…", "target": "mp4|mkv|webm|avi|mp3" }
POST /api/compress  { "jobId": "job_…", "crf": 28 }        // 18-40، كلما زاد صغر الحجم
POST /api/gif       { "jobId": "job_…", "start": 0, "duration": 3, "width": 480 }
```

الحدود المفروضة على `gif`: `start` 0-21600، `duration` 1-20، `width` 120-720
(تُقصّ إلى المدى تلقائياً بدل رفض الطلب).
الطابور: `MAX_FFMPEG=2` عمليات متوازية، `FFMPEG_MAX_WAITING=6` منتظر،
وما زاد يُرفض برسالة واضحة بدل استهلاك الذاكرة.

→ `{ file, fileUrl }` (+ `savedPct` للضغط). الملفات تُخدم من `/files/`.

## 7) الحسابات والسجل

```http
POST /api/auth/register  { "email": "…", "password": "4+ chars" }  // ⇒ token + 50 نقطة
POST /api/auth/login     { "email": "…", "password": "…" }         // ⇒ token
GET  /api/auth/me                                              // يتطلب token
GET  /api/history      # سجل صاحب التوكن فقط؛ الزائر يحصل على []
```

## 8) التواصل والتشخيص

```http
POST /api/contact  { "name": "…", "email": "…", "message": "…" }  // 5/ساعة لكل IP
POST /api/client-error                                            // تقرير خطأ من المتصفح
GET  /api/health      // { ok, db, ytdlp, queue, ffmpeg }
GET  /api/docs        // هذا المرجع كـJSON
```

## 9) البوتات

```http
POST /api/bot/telegram   # header: X-Telegram-Bot-Api-Secret-Token
GET  /api/bot/whatsapp   // GET verification: hub.mode=subscribe + hub.verify_token
POST /api/bot/whatsapp   // hub.verify_token في query
```

الـbots تعمل على allow-list (`TELEGRAM_ALLOWED_CHATS` / `WHATSAPP_ALLOWED_CHATS`)
مع throttle (`BOT_MAX_PER_MIN`). رسالة `/job <id>` في تليجرام تردّ فقط لصاحب المهمة.

## أخطاء

```json
{ "error": "رسالة آمنة قابلة للعرض" }
```

- `4xx`: طلب المستخدم — الرسالة مفصّلة ودائماً بالعربية.
- `5xx`: **لا** تُكشف تفاصيل داخلية (مسارات، stderr من yt-dlp/ffmpeg، أخطاء
  Prisma). التفاصيل في سجلّ الطرفية فقط. الرسالة للعملاء: «خطأ داخلي في السيرفر».
- `404` على `/api/*`: يذكر الطريقة والمسار فقط، ولا يعكس `originalUrl`.

## أمثلة cURL

```bash
# بدء تحميل
curl -X POST localhost:4001/api/download \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","quality":"720p","format":"mp4","threads":8}'

# متابعة مهمة (بلا توكن: مهمة ضيف)
curl localhost:4001/api/job/job_xxx

# مهمة خاصة: بتوكن صاحبها
curl localhost:4001/api/job/job_xxx -H "Authorization: Bearer $TOKEN"

# تسجيل دخول
curl -X POST localhost:4001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
```
