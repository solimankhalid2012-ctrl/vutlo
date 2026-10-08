# 🚀 نشر Vutlo

## التوقيع المختار

**VPS واحد** ← TLS و nginx ← التطبيق على `127.0.0.1:4001`.

لماذا هذا الأنسب لمشروعك:

| القرار | السبب |
|---|---|
| VPS واحد | SQLite + طابور في الذاكرة ⇒ نسخ واحد فقط. نسختان تكسران SQLite وتضاعفان المهام. |
| تطبيق على `127.0.0.1` | أي-hit مباشر على المنفذ 4001 يتخطّى TLS وحدود الطلبات وضبط nginx. لا تفتحه. |
| nginx للأصول الساكنة | Vite مبني مسبقاً ⇒ لا حاجة لـNode لخدمة الملفات الثابتة. |
| systemd | إعادة تشغيل تلقائية + سجل مركزي + حدود عمليات. |
| systemd + `/files` على القرص | كافٍ بالبداية. R2/S3 بروابط موقّعة لاحقاً إن كبر الاستخدام. |

---

## 1) المتطلبات

```bash
# Ubuntu 24.04 / Debian 12
sudo apt update
sudo apt install -y nginx curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs ffmpeg
sudo apt install -y yt-dlp     # أو: pipx install yt-dlp

node -v   # v20+
ffmpeg -version
yt-dlp --version
```

> إن كان نظامك بلا systemd (LXC بلا systemd) أخبرني، 방법 مختلف قليلاً.

## 2) تجهيز التطبيق

```bash
sudo adduser --system --group --home /var/www/videovault videovault
sudo -u videovault git clone <repo> /var/www/videovault
cd /var/www/videovault

sudo -u videovault npm ci
sudo -u videovault npx prisma migrate deploy   # أو: prisma db push
sudo -u videovault npm run build               # يبني dist/ للواجهة
sudo mkdir -p downloads && sudo chown videovault:videovault downloads
```

## 3) الأسرار (لا تُرفع أبداً)

```bash
cp .env.example .env
chmod 600 .env
chown videovault:videovault .env
```

قيمة واحدة تُولَّد الآن:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

للأسرار exig-base64 لكلمة الأدمن:

```bash
# ضع كلمة السر بين علامتَي تنصيص:
node -e "const c=require('crypto'),s=c.randomBytes(16),k=c.scryptSync('YOUR_PASSWORD',s,64,{N:16384,r:8,p:1,maxmem:67108864});console.log(['scrypt',16384,8,1,s.toString('base64url'),k.toString('base64url')].join('$'))"
```

### إعدادات `.env` للتوقيع أعلاه

```dotenv
NODE_ENV=production
PORT=4001
HOST=127.0.0.1          # لا تفتحه للإنترنت
TRUST_PROXY=1           # قفزة واحدة: nginx ⇒ العنصر الأيمن من X-Forwarded-For
FILE_TTL_HOURS=6
LOGIN_IP_MAX_ATTEMPTS=25
```

> `TRUST_PROXY=1` آمن مع تصحيح `req.ip` في التطبيق: تأخذ العنصر
> **الأيمن** فقط، فأي قيمة يرسلها المتصفح تُهمل.

## 4) الجدار الناري

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
# تحقّق: منفذ 4001 يجب ألا يظهر مفتوحاً
sudo ss -tlnp | grep 4001     # يظهر 127.0.0.1:4001 فقط
```

## 5) systemd

```bash
sudo cp deploy/videovault.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now videovault
sudo systemctl status videovault
```

`ProtectSystem=strict` يقرأ `/etc` ويكتب `/var/www/videovault/{prisma,downloads}` فقط.

## 6) nginx + شهادة TLS

```bash
sudo cp dist/index.html /var/www/html/index.html   # لأمر certbot الأول
sudo cp deploy/nginx.conf /etc/nginx/sites-available/videovault
sudo sed -i 's/example.com/YOUR_DOMAIN/g' /etc/nginx/sites-available/videovault
sudo ln -s /etc/nginx/sites-available/videovault /etc/nginx/sites-enabled/
sudo nginx -t

sudo cp -r dist/* /var/www/videovault/dist/
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
sudo systemctl reload nginx
```

## 7) تحقّق بعد النشر

```bash
curl -s localhost:4001/api/health | head -c 300     # من الخادم نفسه
curl -s https://YOUR_DOMAIN/api/health             # من الخارج
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN/api/history   # 401 أو 200
```

ثم يدوياً من المتصفح:

- [ ] تحميل فيديو حقيقي + تحويل MP3 + جلب الملف من `/files`
- [ ] تسجيل مستخدم، ثم التأكد أن سجل مستخدم آخر لا يظهر في `/api/history`
- [ ] لوحة الأدمن: الإحصائيات والمستخدمون بلا أخطاء
- [ ] `journalctl -u videovault -n 50` ⇒ لا أخطاء

---

## الصيانة

```bash
cd /var/www/videovault
sudo -u videovault git pull
sudo -u videovault npm ci && sudo -u videovault npx prisma migrate deploy
sudo -u videovault npm run build
sudo cp -r dist/* /var/www/videovault/dist/
sudo systemctl restart videovault
```

نسخ احتياطي (قاعدة البيانات + الإعدادات):

```bash
sudo -u videovault sqlite3 prisma/dev.db ".backup '/tmp/backup.db'"
sudo tar czf /tmp/videovault-$(date +%F).tgz /var/www/videovault/prisma /var/www/videovault/.env
```

## عند الحاجة لاحقاً

| الحاجة | الخطوة |
|---|---|
| روابط تنزيل موقّعة | R2/S3 + `/files` يحوّل من static إلى توقيع |
| عدة نسخ | Redis + BullMQ، والانتقال من SQLite |
| ضغط تحت حجم كبير | CDN للواجهة فقط (لا للـAPI) |