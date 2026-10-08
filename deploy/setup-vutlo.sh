#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-vutlo.sh — تثبيت تطبيق Vutlo بالكامل على جهاز
#              Oracle Cloud Always Free (Ubuntu 22.04 / 24.04)
#
# الاستخدام (على الـ VM):
#   sudo bash setup-vutlo.sh <مسار-المشروع-على-الجهاز> [النطاق.com]
#   sudo bash setup-vutlo.sh https://github.com/you/vutlo.git [النطاق.com]
#
# ما يفعله:
#   1) تثبيت Node 22 + ffmpeg + aria2 + yt-dlp + nginx
#   2) نسخ الكود إلى /opt/vutlo (مشرف مستخدم مخصص vutlo)
#   3) توليد .env بأسرار (JWT + كلمة مرور مشرف مهشّشة scrypt)
#   4) بناء الواجهة وتفعيل الخدمة عبر systemd (تعمل 24/7 وتنهض وحدها)
#   5) Nginx ناقل عكسي 80/443 → 127.0.0.1:4001 + HTTPS مجاني إن وُجد نطاق
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SRC="${1:-}"
DOMAIN="${2:-}"
APP_DIR="/opt/vutlo"
APP_USER="vutlo"
SERVICE="vutlo"

log(){ printf '\n[i] %s\n' "$*"; }

# إصلاح أسطر CRLF إن نُقل الملف من ويندوز ثم إعادة التشغيل نسخة نظيفة
if LC_ALL=C grep -q $'\r' "$0" 2>/dev/null; then
  sed -i -e 's/\r$//' "$0"
  exec bash "$0" "$@"
fi

[ "$(id -u)" -eq 0 ] || { echo "[!] شغّل بصلاحيات root: sudo bash setup-vutlo.sh ..." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "[!] يتطلب توزيعة Debian/Ubuntu." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive

# عنوان عام تلقائي (IP الظاهر أو أول واجهة) — يُحسب مرة واحدة
PUB_IP=$(curl -fsSL --max-time 6 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
[ -n "$PUB_IP" ] || PUB_IP="your-server-ip"

# ── 1) النظام والحزم الأساسية ───────────────────────────────
log "تحديث النظام وتثبيت الحزم الأساسية..."
apt-get update -y
apt-get install -y curl git ffmpeg aria2 nginx openssl ca-certificates

# ── 2) Node.js LTS (يدرك ARM64 لأجهزة Ampere) ───────────────
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]; then
  log "تثبيت Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "node: $(node -v) | npm: $(npm -v)"

# ── 3) yt-dlp — أحدث نسخة دائمة التحديث ─────────────────────
log "تثبيت yt-dlp إلى /usr/local/bin/yt-dlp"
curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod +x /usr/local/bin/yt-dlp
/usr/local/bin/yt-dlp --version

# ── 4) مستخدم مخصص (بلا دخول shell) لتشغيل الخدمة ──────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd -r -m -d "/home/$APP_USER" -s /usr/sbin/nologin "$APP_USER"
fi

# ── 5) جلب الكود ────────────────────────────────────────────
mkdir -p "$APP_DIR"
if [ -n "$SRC" ]; then
  if [[ "$SRC" =~ ^https?:// ]]; then
    rm -rf "$APP_DIR"
    git clone --depth 1 "$SRC" "$APP_DIR"
  elif [ -f "$SRC/package.json" ]; then
    cp -a "$SRC/." "$APP_DIR/"
  else
    echo "[!] المصدر غير صالح: $SRC" >&2; exit 1
  fi
elif [ -f "$APP_DIR/package.json" ]; then
  log "استخدام الكود الموجود في $APP_DIR"
else
  echo "[!] لا يوجد كود! مرّر مسار المشروع أو رابط GitHub كوسيط." >&2; exit 1
fi
mkdir -p "$APP_DIR/downloads" "$APP_DIR/data"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod g+s "$APP_DIR/downloads"

# ── 6) .env — أسرار وضبط ────────────────────────────────────
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "توليد مفاتيح .env"
  JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  read -s -p "كلمة مرور المشرف (8+ أحرف): " ADMIN_PW; echo
  [ "${#ADMIN_PW}" -ge 8 ] || { echo "[!] أقصر من 8 أحرف." >&2; exit 1; }
  read -s -p "إعادة كلمة المرور: " ADMIN_PW2; echo
  [ "$ADMIN_PW" = "$ADMIN_PW2" ] || { echo "[!] غير متطابقتين." >&2; exit 1; }

  read -p "بريد المشرف للدخول [admin@vutlo.app]: " ADMIN_MAIL
  ADMIN_MAIL="${ADMIN_MAIL:-admin@vutlo.app}"

  # هاش بصيغة المشروع: scrypt$N$r$p$salt$key (base64url)
  HASH=$(ADMIN_PW="$ADMIN_PW" node <<'NODE'
    const c = require("crypto");
    const pw = process.env.ADMIN_PW;
    const salt = c.randomBytes(16);
    const key = c.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    process.stdout.write(["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$"));
NODE
  )
  unset ADMIN_PW ADMIN_PW2

  if [ -n "$DOMAIN" ]; then BASE="https://$DOMAIN"; else BASE="http://$PUB_IP"; fi

  {
    echo "NODE_ENV=production"
    echo "HOST=127.0.0.1"
    echo "PORT=4001"
    echo "TRUST_PROXY=1"
    echo "JWT_SECRET=$JWT"
    echo "ADMIN_PASS_HASH=$HASH"
    echo "ADMIN_EMAIL=$ADMIN_MAIL"
    echo "DOWNLOAD_DIR=$APP_DIR/downloads"
    echo "DATABASE_URL=file:$APP_DIR/prisma/dev.db"
    echo "CLIENT_URL=$BASE"
    echo "VITE_SITE_URL=$BASE"
  } > "$ENV_FILE"
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "تم توليد $ENV_FILE"
else
  log "استخدام .env الموجود"
fi

# ── 7) تثبيت الحزم وبناء الواجهة (نحمّل VITE_SITE_URL في زمن البناء) ──
log "تثبيت الاعتماديات وبناء الواجهة (قد يستغرق دقائق)..."
set -a; . "$ENV_FILE"; set +a
cd "$APP_DIR"
if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi
npm run build

# قاعدة بيانات دائمة (SQLite عبر prisma/schema.prisma) — المستخدمون/السجل/التقييمات تبقى
if [ -f "$APP_DIR/prisma/schema.prisma" ]; then
  log "تجهيز قاعدة البيانات الثابتة SQLite..."
  ( cd "$APP_DIR" && npx prisma generate ) || echo "[!] prisma generate فشل"
  ( cd "$APP_DIR" && npx prisma db push --skip-generate ) || echo "[!] db push فشل — ستعمل قاعدة الذاكرة مؤقتاً"
fi

# ── 8) وحدة systemd — خدمة 24/7 ─────────────────────────────
log "تثبيت وتشغيل الخدمة $SERVICE"
cat > /etc/systemd/system/vutlo.service <<EOF
[Unit]
Description=Vutlo (videovault-pro) web service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3
Nice=5
UMask=0007
MemoryMax=1024M
ReadWritePaths=$APP_DIR/downloads $APP_DIR/data $APP_DIR/prisma

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE" || true

# ── 9) Nginx ناقل عكسي ──────────────────────────────────────
log "ضبط Nginx على المنفذ 80${DOMAIN:+ و 443}"
cat > /etc/nginx/sites-available/vutlo <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN:-$PUB_IP};

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/vutlo /etc/nginx/sites-enabled/vutlo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# HTTPS مجاني إن وُجد نطاق
if [ -n "$DOMAIN" ]; then
  log "شهادات HTTPS عبر certbot للنطاق $DOMAIN"
  apt-get install -y python3-certbot-nginx >/dev/null 2>&1 || true
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_MAIL" --redirect || \
    echo "[!] فشلت المرحلة الآلية لـ certbot — شغّل الخطوة يدوياً."
fi

# ── 10) جدار ناري (التقييم الحقيقي عبر OCI Security List) ──
if ! command -v ufw >/dev/null; then apt-get install -y ufw >/dev/null 2>&1 || true; fi
if command -v ufw >/dev/null && ! ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

# ── النتيجة ─────────────────────────────────────────────────
sleep 1
CODE=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/ 2>/dev/null || echo "غير مستجيب")
log "فحص محلي: HTTP $CODE عند http://127.0.0.1:4001/"
systemctl is-active "$SERVICE" >/dev/null && log "الخدمة $SERVICE نشطة (ستعود تلقائياً بعد كل إعادة إقلاع)." || echo "[!] الخدمة غير نشطة — راجع: journalctl -u $SERVICE"
echo
echo "─────────────────────────────────────────────────────────"
echo "  موقعك متاح الآن:  ${BASE:-http://$PUB_IP}"
echo "  لوحة الأدمن:     /admin   (البريد: $ADMIN_MAIL)"
echo "  الأسرار في:      $ENV_FILE (JWT_SECRET + ADMIN_PASS_HASH)"
echo "  ملفات التحميل:   $APP_DIR/downloads  (باقية على القرص)"
echo "─────────────────────────────────────────────────────────"
echo "  ملاحظات:"
echo "  • قاعدة البيانات SQLite دائمة على القرص (مستخدمون/سجل/تقييمات/جداول)."
echo "  • ملفات التحميل والرفع تبقى على القرص الثابت (الفرق عن أي خطة مجانية)."
echo "  • التحديث لاحقاً:  cd /opt/vutlo && git pull && sudo bash /opt/vutlo/deploy/setup-vutlo.sh"
echo "  • نسيان كلمة المرور: عدّل ADMIN_PASS_HASH في .env بإعادة تشغيل السكربت."