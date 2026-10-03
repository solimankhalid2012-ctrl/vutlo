/**
 * فحص حي: يطبّق نفس منطق المتصفح على الاستجابة الحقيقية من السيرفر.
 * المتصفح يقارن بصمة نص كل سكربت inline مع script-src في الترويسة.
 * إن لم تجد كل بصمة ⇒ سيحجب السكربت ويظهر خطأ CSP للمستخدم.
 */
const BASE = process.argv[2] || "http://127.0.0.1:4001";
const crypto = await import("crypto");

const res = await fetch(`${BASE}/`);
const html = await res.text();
const csp = res.headers.get("content-security-policy") || "";

const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("base64");
const scriptSrc = (csp.match(/script-src[^;]*/) || [""])[0];

const inline = [];
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  if (m[1].includes("src=")) continue;
  const kind = m[1].includes("ld+json") ? "JSON-LD" : "inline JS";
  inline.push({ kind, hash: `'sha256-${sha(m[2])}'` });
}

console.log(`HTTP ${res.status}  —  ${html.length} bytes\n`);
console.log("script-src:", scriptSrc, "\n");

let bad = 0;
for (const s of inline) {
  const ok = scriptSrc.includes(s.hash);
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.kind.padEnd(9)} ${s.hash}`);
}
console.log(`\ninline scripts: ${inline.length}  blocked: ${bad}`);

const img = (csp.match(/img-src[^;]*/) || [""])[0];
const media = (csp.match(/media-src[^;]*/) || [""])[0];
console.log(`\nimg-src:    ${img}`);
console.log(`media-src:  ${media}`);

const checks = [
  ["مصغّرات يوتيوب (i.ytimg.com)", img.includes("https:")],
  ["مصغّرات Pinterest (i.pinimg.com)", img.includes("https:")],
  ["معاينة محلية (blob:)", img.includes("blob:") && media.includes("blob:")],
  ["لا 'unsafe-inline' للسكربتات", !scriptSrc.includes("unsafe-inline")],
  ["كل سكربتات inline مسموحة", bad === 0],
  ["سمات onclick محجوبة (script-src-attr 'none')", /script-src-attr 'none'/.test(csp)],
  ["object محجوب", csp.includes("object-src 'none'")],
];
console.log();
let fail = 0;
for (const [name, ok] of checks) {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED"}`);
// exitCode بدل process.exit(): الأخير يطلق تأكيد libuv على ويندوز
process.exitCode = fail === 0 ? 0 : 1;