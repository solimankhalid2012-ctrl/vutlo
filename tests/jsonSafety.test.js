/**
 * انحدار لخطأ "Uncaught (in promise) SyntaxError: Unexpected end of JSON input":
 * أي استدعاء response.json() على رد فارغ/مبتور (أو JSON.parse بلا حماية) يرمي
 * استثناء داخل promise فلا يلتقطه try/catch الخاص بالطبقة الأعلى.
 * هنا نمسح src كاملاً ونمنع عودة النمطين.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const EXT = /\.(js|jsx|mjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((p) => ({
  path: relative(ROOT, p).replace(/\\/g, "/"),
  code: readFileSync(p, "utf8"),
}));

describe("سلامة JSON في الواجهة", () => {
  it("لا يوجد استدعاء .json() على ردود الشبكة (استخدمنا safeJson)", () => {
    const bad = files.filter((f) => /\.json\(\)/.test(f.code)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("كل JSON.parse محمي بـ try/catch", () => {
    const unsafe = [];
    for (const f of files) {
      let i = -1;
      while ((i = f.code.indexOf("JSON.parse", i + 1)) !== -1) {
        const before = f.code.slice(Math.max(0, i - 400), i);
        const after = f.code.slice(i, i + 400);
        if (!/try\s*{[^}]*$/.test(before) || !/\}\s*catch/.test(after)) {
          const line = f.code.slice(0, i).split("\n").length;
          unsafe.push(`${f.path}:${line}`);
        }
      }
    }
    expect(unsafe).toEqual([]);
  });
});