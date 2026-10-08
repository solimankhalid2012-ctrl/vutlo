#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# update-dyndns.sh — يحافظ على الربط بين رابطك الجميل المجاني
#              (DuckDNS) والـIP الفعلي لجهاز Oracle VM تلقائياً.
#
# DuckDNS: خدمة مجانية تعطيك اسماً مثل vutlo.duckdns.org
#   - التسجيل بـ Google/GitHub (بلا بطاقة) — https://www.duckdns.org
#   - من لوحتهم انسخ TOKEN الخاص بك
#
# الإعداد (مرة واحدة):
#   sudo bash update-dyndns.sh --install   ← يسألك عن الاسم والـTOKEN ويضبط cron
# أو يدوياً: أنشئ /etc/duckdns.conf بهذين السطرين:
#   SUBDOM="vutlo"
#   TOKEN="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#
# ثم أي وقت لاحق:
#   sudo bash update-dyndns.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CONF="/etc/duckdns.conf"
INSTALLED="/etc/cron.d/vutlo-duckdns"

log(){ printf '\n[i] %s\n' "$*"; }

if [ "${1:-}" = "--install" ]; then
  [ "$(id -u)" -eq 0 ] || { echo "[!] شغّل بصلاحيات root أو sudo." >&2; exit 1; }
  read -p "الاسم الفرعي المطلوب [vutlo]: " SUBDOM
  SUBDOM="${SUBDOM:-vutlo}"
  read -s -p "TOKEN من duckdns.org: " TOKEN; echo
  [ -n "$TOKEN" ] || { echo "[!] TOKEN فارغ." >&2; exit 1; }
  printf 'SUBDOM="%s"\nTOKEN="%s"\n' "$SUBDOM" "$TOKEN" > "$CONF"
  chmod 600 "$CONF"
  cat > "$INSTALLED" <<EOF
@reboot root /opt/vutlo/deploy/update-dyndns.sh
0 * * * * root /opt/vutlo/deploy/update-dyndns.sh
EOF
  log "تم الضبط: $CONF + تحديث تلقائي عند كل إقلاع وكل ساعة ($INSTALLED)."
  exec bash "$0"
fi

[ -f "$CONF" ] || { echo "[!] لا يوجد $CONF — شغّل: sudo bash setup update-dyndns.sh --install أولاً." >&2; exit 1; }
. "$CONF"
sub="${SUBDOM:-}"; tok="${TOKEN:-}"
[ -n "$sub" ] && [ -n "$tok" ] || { echo "[!] SUBDOM/TOKEN ناقصان في $CONF." >&2; exit 1; }

IP=$(curl -fsSL --max-time 8 https://api.ipify.org 2>/dev/null || true)
IP="${IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "${IP:-}" ] || { echo "[!] تعذّر معرفة الـIP." >&2; exit 1; }

RESP=$(curl -fsS --max-time 12 "https://www.duckdns.org/update?domains=${sub}&token=${tok}&ip=${IP}" 2>/dev/null || echo "FAIL")
echo "[duckdns] $sub.duckdns.org -> $IP  ($RESP)"
[ "$RESP" = "OK" ] && exit 0 || exit 1