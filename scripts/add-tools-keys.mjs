import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src/locales");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const T = {
  ar: {
    title: "اختر أداتك",
    hint: "كل ما يمكنك فعله، في مكان واحد قبل التحميل",
    gifOpts: "خيارات المقطع",
    gifStart: "من (ثانية)",
    gifDur: "المدة (ثانية)",
    gifWidth: "العرض (px)",
    compressing: "جارٍ الضغط…",
    lockedFormat: "صيغة ثابتة لهذه الأداة",
    playlistAll: "تحديد الكل",
    playlistNone: "إلغاء الكل",
  },
  en: {
    title: "Pick your tool",
    hint: "Everything you can do, in one place before downloading",
    gifOpts: "Clip options",
    gifStart: "Start (sec)",
    gifDur: "Duration (sec)",
    gifWidth: "Width (px)",
    compressing: "Compressing…",
    lockedFormat: "Fixed format for this tool",
    playlistAll: "Select all",
    playlistNone: "Clear all",
  },
  de: {
    title: "Wähle dein Werkzeug",
    hint: "Alles Mögliche an einem Ort — vor dem Download",
    gifOpts: "Clip-Optionen",
    gifStart: "Start (Sek.)",
    gifDur: "Dauer (Sek.)",
    gifWidth: "Breite (px)",
    compressing: "Komprimieren…",
    lockedFormat: "Festes Format für dieses Werkzeug",
    playlistAll: "Alle auswählen",
    playlistNone: "Auswahl aufheben",
  },
  es: {
    title: "Elige tu herramienta",
    hint: "Todo lo que puedes hacer, en un solo lugar antes de descargar",
    gifOpts: "Opciones del clip",
    gifStart: "Inicio (s)",
    gifDur: "Duración (s)",
    gifWidth: "Ancho (px)",
    compressing: "Comprimiendo…",
    lockedFormat: "Formato fijo para esta herramienta",
    playlistAll: "Seleccionar todo",
    playlistNone: "Quitar todo",
  },
  fr: {
    title: "Choisissez votre outil",
    hint: "Tout ce que vous pouvez faire, au même endroit avant le téléchargement",
    gifOpts: "Options du clip",
    gifStart: "Début (s)",
    gifDur: "Durée (s)",
    gifWidth: "Largeur (px)",
    compressing: "Compression…",
    lockedFormat: "Format fixe pour cet outil",
    playlistAll: "Tout sélectionner",
    playlistNone: "Tout désélectionner",
  },
  fa: {
    title: "ابزارت را انتخاب کنید",
    hint: "همه کارهای ممکن، پیش از دانلود در یک جا",
    gifOpts: "تنظیمات کلیپ",
    gifStart: "شروع (ثانیه)",
    gifDur: "مدت (ثانیه)",
    gifWidth: "عرض (پیکسل)",
    compressing: "در حال فشرده‌سازی…",
    lockedFormat: "قالب ثابت برای این ابزار",
    playlistAll: "انتخاب همه",
    playlistNone: "لغو همه",
  },
  he: {
    title: "בחר כלי",
    hint: "כל מה שאפשר לעשות, במקום אחד לפני ההורדה",
    gifOpts: "אפשרויות קליפ",
    gifStart: "התחלה (שניות)",
    gifDur: "משך (שניות)",
    gifWidth: "רוחב (px)",
    compressing: "בתהליך דחיסה…",
    lockedFormat: "פורמט קבוע לכלי זה",
    playlistAll: "בחר הכול",
    playlistNone: "נקה הכול",
  },
  id: {
    title: "Pilih alatmu",
    hint: "Semua yang bisa dilakukan, di satu tempat sebelum mengunduh",
    gifOpts: "Opsi klip",
    gifStart: "Mulai (detik)",
    gifDur: "Durasi (detik)",
    gifWidth: "Lebar (px)",
    compressing: "Mengompres…",
    lockedFormat: "Format tetap untuk alat ini",
    playlistAll: "Pilih semua",
    playlistNone: "Batalkan semua",
  },
  tr: {
    title: "Aracını seç",
    hint: "Yapabileceğin her şey, indirmeden önce tek bir yerde",
    gifOpts: "Klip seçenekleri",
    gifStart: "Başlangıç (sn)",
    gifDur: "Süre (sn)",
    gifWidth: "Genişlik (px)",
    compressing: "Sıkıştırılıyor…",
    lockedFormat: "Bu araç için sabit format",
    playlistAll: "Tümünü seç",
    playlistNone: "Tümünü kaldır",
  },
  ur: {
    title: "اپنا آلٹ چنیں",
    hint: "ہر وہ کچھ جو آپ کر سکتے ہیں، ڈاؤن لوڈ سے پہلے ایک جگہ",
    gifOpts: "کلپ کے اختیارات",
    gifStart: "شروع (سیکنڈ)",
    gifDur: "دورانیہ (سیکنڈ)",
    gifWidth: "چوڑائی (px)",
    compressing: "کمپریس ہو رہا ہے…",
    lockedFormat: "اس آلٹ کے لیے مقررہ فارمیٹ",
    playlistAll: "سب منتخب کریں",
    playlistNone: "سب ہٹا دیں",
  },
};

for (const f of files) {
  const code = path.basename(f, ".json");
  const p = path.join(dir, f);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  json.tools = { ...(json.tools || {}), ...(T[code] || T.en) };
  json.playlist = { ...(json.playlist || {}), all: T[code]?.playlistAll || T.en.playlistAll, none: T[code]?.playlistNone || T.en.playlistNone };
  json.download = { ...(json.download || {}), trimHint: T[code]?.trimHint || "" };
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("updated", f);
}
