import fs from "fs";
import crypto from "crypto";

const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("base64");
const files = ["index.html", "dist/index.html"];
const found = new Map();

for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    if (m[1].includes("src=")) continue;
    i++;
    const kind = m[1].includes("ld+json") ? "jsonld" : "lang";
    const hash = `'sha256-${sha(m[2])}'`;
    const key = `${kind}|${hash}`;
    if (!found.has(key)) found.set(key, { kind, hash, files: [] });
    found.get(key).files.push(f);
  }
}

console.log(`distinct inline scripts: ${found.size}`);
for (const v of found.values()) {
  console.log(`${v.kind.padEnd(6)} ${v.hash}`);
  console.log(`       from: ${v.files.join(", ")}`);
}
console.log("\n--- copy into SCRIPT_DIGESTS in server/config/csp.js ---");
for (const v of found.values()) {
  const digest = v.hash.replace(/^'sha256-/, "").replace(/'$/, "");
  console.log(`  ${v.kind.padEnd(6)}: "${digest}",`);
}
console.log("\n(keep the trailing '=' padding — dropping it makes browsers reject the hash)");