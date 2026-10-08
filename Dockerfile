# ─────────────────────────────────────────────
# Dockerfile — صورة النشر على Render (وأي مضيف حاويات)
# محتوى الصورة: ملفات الواجهة المبنية + السيرفر + أدوات التشغيل
#   • yt-dlp          (محرك التحميل الأساسي)
#   • ffmpeg/aria2    (دمج المقاطع + التحميل المتوازي)
#   • python3         (محرك فحص المختبر — يحسّن الفحص عبر scanner.py)
# مرحلتان: بناء الواجهة، ثم نسخ الاعتماديات الإنتاجية فقط (صورة أخف).
# ─────────────────────────────────────────────

# ── المرحلة 1: بناء الواجهة (Vite) ──
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── المرحلة 2: التشغيل ──
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# أدوات التحميل + فحص المختبر + HTTPS
# yt-dlp يُركَّب عبر pip (مستقل عن المعمارية: يعمل على amd64 وarm64
# على خلاف الملف المبنّي المنزّل من GitHub الذي يفشل بنِمط ENOEXEC)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg aria2 python3 python3-pip ca-certificates curl \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp \
  && rm -rf /var/lib/apt/lists/*

# الاعتماديات الإنتاجية فقط
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# التطبيق (خدمة الملفات + الواجهة المبنية)
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY prisma ./prisma

EXPOSE 4001

# فحص حي لـ Render: 200 من /api/health يعني أن الحاوية بخير
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]