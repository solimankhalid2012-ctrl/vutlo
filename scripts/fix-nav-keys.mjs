import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");

const ADD = {
  ar: { about: "من نحن", contact: "تواصل معنا", privacy: "الخصوصية", terms: "الشروط" },
  en: { about: "About", contact: "Contact", privacy: "Privacy", terms: "Terms" },
  he: { about: "אודות", contact: "צור קשר", privacy: "פרטיות", terms: "תנאים" },
  fr: { about: "À propos", contact: "Contact", privacy: "Confidentialité", terms: "Conditions" },
  es: { about: "Acerca de", contact: "Contacto", privacy: "Privacidad", terms: "Términos" },
  de: { about: "Über uns", contact: "Kontakt", privacy: "Datenschutz", terms: "AGB" },
  tr: { about: "Hakkında", contact: "İletişim", privacy: "Gizlilik", terms: "Koşullar" },
  fa: { about: "درباره", contact: "تماس", privacy: "حریم خصوصی", terms: "شرایط" },
  ur: { about: "ہمارے بارے میں", contact: "رابطہ", privacy: "رازداری", terms: "شرائط" },
  id: { about: "Tentang", contact: "Kontak", privacy: "Privasi", terms: "Ketentuan" },
};

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const code = file.replace(".json", "");
  const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
  data.nav = data.nav || {};
  delete data.nav.advertisers;
  Object.assign(data.nav, ADD[code] || {});
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("updated", file, "nav:", Object.keys(data.nav).join(","));
}
