/**
 * انحدار لخطأ "Uncaught (in promise) SyntaxError: Unexpected end of JSON input":
 * أي استدعاء response.json() على رد فارغ/مبتور (أو JSON.parse بلا حماية) يرمي
 * استثناء داخل promise فلا يلتقطه try/catch الخاص بالطبقة الأعلى.
 * هنا نمسح src و server كاملين ونمنع عودة النمطين.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { safeJson } from "../server/config/safeJson.js";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SRV = join(ROOT, "server");
const EXT = /\.(js|jsx|mjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

/** نحذف التعليقات قبل الفحص: ذكر response.json() في شرح ليس استدعاءً */
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (dir) =>
  walk(dir).map((p) => ({
    path: relative(ROOT, p).replace(/\\/g, "/"),
    code: stripComments(readFileSync(p, "utf8")),
  }));

const files = read(SRC);
const serverFiles = read(SRV);

/** مواقع JSON.parse غير المحمية ب	try/catch */
function unsafeParses(list, win = 400) {
  const unsafe = [];
  for (const f of list) {
    let i = -1;
    while ((i = f.code.indexOf("JSON.parse", i + 1)) !== -1) {
      const before = f.code.slice(Math.max(0, i - win), i);
      const after = f.code.slice(i, i + win);
      if (!/try\s*{/.test(before) || !/\}\s*catch/.test(after)) {
        const line = f.code.slice(0, i).split("\n").length;
        unsafe.push(`${f.path}:${line}`);
      }
    }
  }
  return unsafe;
}

describe("سلامة JSON في الواجهة", () => {
  it("لا يوجد استدعاء .json() على ردود الشبكة (استخدمنا safeJson)", () => {
    const bad = files.filter((f) => /\.json\(\)/.test(f.code)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("كل JSON.parse محمي بـ try/catch", () => {
    expect(unsafeParses(files)).toEqual([]);
  });
});

describe("سلامة JSON في السيرفر", () => {
  it("لا يوجد response.json() غير محمي (Telegram/WhatsApp)", () => {
    const bad = serverFiles.filter((f) => /\.json\(\)/.test(f.code)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("كل JSON.parse محمي بـ try/catch", () => {
    // نافذة أوسع هنا: استدعاءات yt-dlp محمية لكن ضمن سطور طويلة
    expect(unsafeParses(serverFiles, 1200)).toEqual([]);
  });

  it("safeJson لا يرمي: رد فارغ/مبتور/غير JSON يرجع fallback", async () => {
    const mk = (text) => ({ text: async () => text });
    await expect(safeJson(mk(""))).resolves.toEqual({});
    await expect(safeJson(mk("{"))).resolves.toEqual({});
    await expect(safeJson(mk('{"ok":true}'), null)).resolves.toEqual({ ok: true });
    await expect(safeJson({ text: async () => { throw new Error("aborted"); } }, "fb")).resolves.toBe("fb");
    // حتى null لا يسبب استثناء (الالتقاط داخلي)
    expect(() => safeJson(null)).not.toThrow();
  });
});
