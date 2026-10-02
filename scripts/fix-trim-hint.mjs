import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src/locales");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const HINT = {
  ar: "بالثواني — اتركه فارغاً للتنزيل كاملاً",
  en: "In seconds — leave empty for the full video",
  de: "In Sekunden — leer lassen für das ganze Video",
  es: "En segundos — déjalo vacío para el video completo",
  fr: "En secondes — laisser vide pour la vidéo entière",
  fa: "بر حسب ثانیه — برای دانلود کامل خالی بگذارید",
  he: "בשניות — השאירו ריק לסרטון המלא",
  id: "Dalam detik — kosongkan untuk video penuh",
  tr: "Saniye cinsinden — tamamı için boş bırakın",
  ur: "سیکنڈ میں — مکمل ویڈیو کے لیے خالی چھوڑیں",
};

for (const f of files) {
  const code = path.basename(f, ".json");
  const p = path.join(dir, f);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  json.download = { ...(json.download || {}), trimHint: HINT[code] || HINT.en };
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("updated", f);
}
