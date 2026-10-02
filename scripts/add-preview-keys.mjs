import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src/locales");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const T = {
  ar: { freeCap: "الحد المجاني 1080p", proOnly: "متاح في خطة Pro فقط", upgradeHint: "الجودات الأعلى من 1080p متاحة في خطة Pro.", upgrade: "ترقية" },
  en: { freeCap: "Free plan max 1080p", proOnly: "Pro plan only", upgradeHint: "Qualities above 1080p are available on the Pro plan.", upgrade: "Upgrade" },
  de: { freeCap: "Kostenlos bis 1080p", proOnly: "Nur im Pro-Tarif", upgradeHint: "Qualitäten über 1080p gibt es im Pro-Tarif.", upgrade: "Upgrade" },
  es: { freeCap: "Gratis hasta 1080p", proOnly: "Solo plan Pro", upgradeHint: "Las calidades por encima de 1080p están en el plan Pro.", upgrade: "Mejorar" },
  fr: { freeCap: "Offert jusqu'à 1080p", proOnly: "Offre Pro uniquement", upgradeHint: "Les qualités au-delà de 1080p sont réservées à l'offre Pro.", upgrade: "Passer à Pro" },
  fa: { freeCap: "رایگان تا 1080p", proOnly: "فقط در پلن Pro", upgradeHint: "کیفیت‌های بالاتر از 1080p در پلن Pro موجود است.", upgrade: "ارتقا" },
  he: { freeCap: "חינם עד 1080p", proOnly: "רק בתוכנית Pro", upgradeHint: "איכויות מעל 1080p זמינות בתוכנית Pro.", upgrade: "שדרוג" },
  id: { freeCap: "Gratis hingga 1080p", proOnly: "Khusus paket Pro", upgradeHint: "Kualitas di atas 1080p tersedia di paket Pro.", upgrade: "Tingkatkan" },
  tr: { freeCap: "Ücretsiz en fazla 1080p", proOnly: "Yalnızca Pro pakette", upgradeHint: "1080p üzeri kaliteler Pro pakette sunulur.", upgrade: "Yükselt" },
  ur: { freeCap: "مفت 1080p تک", proOnly: "صرفاً Pro پلان", upgradeHint: "1080p سے اوپر کی کوالٹی Pro پلان میں دستیاب ہیں۔", upgrade: "اپ گریڈ" },
};

for (const f of files) {
  const code = path.basename(f, ".json");
  const p = path.join(dir, f);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  json.preview = json.preview || {};
  Object.assign(json.preview, T[code] || T.en);
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("updated", f);
}
