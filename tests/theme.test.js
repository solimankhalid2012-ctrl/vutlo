/**
 * انحدار للوضع النهاري.
 *
 * كل ألوان Tailwind صارت رموز CSS (--c-*) ⇒ لو نسي رمزاً في themes.css
 * فإن العنصر يصير شفافاً/أسود في النهاري دون أي خطأ ولا رسالة. هنا نمسح
 * ما يعرّفه tailwind.config.js ونطلب لكل رمز قيمة في :root الليلي وفي
 * :root[data-theme="light"] النهاري.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const cfg = fs.readFileSync("tailwind.config.js", "utf8");
const globals = fs.readFileSync("src/styles/globals.css", "utf8");
const themes = fs.readFileSync("src/styles/themes.css", "utf8");

const tokenNames = [...new Set([...cfg.matchAll(/token\("(--c-[a-z0-9-]+)"\)/g)].map((m) => m[1]))];

function blockOf(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") { depth--; if (depth === 0) return css.slice(open + 1, i); }
  }
  return "";
}

const darkBlock = blockOf(globals, ":root {");
const lightBlock = blockOf(themes, ':root[data-theme="light"] {');

describe("رموز الوضع النهاري", () => {
  it("tailwind يستخدم رموز CSS (لا ألوان ثابتة)", () => {
    expect(tokenNames.length).toBeGreaterThanOrEqual(15);
    expect(cfg).not.toMatch(/DEFAULT:\s*"#/); // لا قيم hex مباشرة
  });

  it("كل رمز له قيمة في الوضع الليلي", () => {
    const missing = tokenNames.filter((t) => !new RegExp(`${t}:\\s*[\\d\\s]+;`).test(darkBlock));
    expect(missing).toEqual([]);
  });

  it("كل رمز له قيمة في الوضع النهاري", () => {
    const missing = tokenNames.filter((t) => !new RegExp(`${t}:\\s*[\\d\\s]+;`).test(lightBlock));
    expect(missing).toEqual([]);
  });

  it("النص فوق اللون معكوس بين الوضعين (تباين الأزرار)", () => {
    const dark = darkBlock.match(/--c-on-accent:\s*(\d+ \d+ \d+)/)[1];
    const light = lightBlock.match(/--c-on-accent:\s*(\d+ \d+ \d+)/)[1];
    const lum = (c) => c.split(" ").map(Number).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    expect(lum(dark)).toBeLessThan(80);   // نص داكن في الليلي
    expect(lum(light)).toBeGreaterThan(200); // نص فاتح في النهاري
  });

  it("النص الأساسي (ink) معكوس بين الوضعين", () => {
    const dark = darkBlock.match(/--c-ink:\s*(\d+ \d+ \d+)/)[1].split(" ").map(Number);
    const light = lightBlock.match(/--c-ink:\s*(\d+ \d+ \d+)/)[1].split(" ").map(Number);
    expect(Math.max(...dark)).toBeGreaterThan(200);  // أبيض في الليلي
    expect(Math.max(...light)).toBeLessThan(80);     // حبر داكن في النهاري
  });
});

describe("مبدّل الوضع في الترويسة", () => {
  it("زر له role=switch ويتحكم بالوضعين", () => {
    const header = fs.readFileSync("src/components/common/Header.jsx", "utf8");
    expect(header).toContain('role="switch"');
    expect(header).toContain("aria-checked={isDark}");
    expect(header).toContain("toggle");
    // المقبض يتحرّك بخصائص منطقية (insetInlineStart) ليعمل في RTL أيضاً
    expect(header).toContain("insetInlineStart");
  });

  it("المؤشّر مشترك: 10 أشرطة بلا نسخة مكرّرة في AppRoutes", () => {
    const loader = fs.readFileSync("src/components/common/Loader.jsx", "utf8");
    expect(loader).toContain("length: 10");
    const routes = fs.readFileSync("src/routes/AppRoutes.jsx", "utf8");
    expect(routes).toContain('import Loader from "../components/common/Loader.jsx"');
    expect(routes).not.toContain("animate-glow-pulse");
  });
});