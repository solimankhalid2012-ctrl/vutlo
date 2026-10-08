/**
 * 🔬 ماسح الملفات الذكي — shared/fileScan.js
 *
 * نبني هنا عينات حقيقية (توقيعات سحرية فعلية) بدل الاعتماد على اسم الملف فقط،
 * لأن جوهر الماسح هو: «ما يقوله الامتداد» ≠ «ما هو الملف فعلاً».
 */
import { describe, it, expect } from "vitest";
import {
  scan, safeName, extsOf, entropy, detectShebang, canHost, serveMode,
  SIGNATURES, DANGEROUS_EXTS, MACRO_EXTS,
} from "../shared/fileScan.js";

/* ── بناء عينات بايت ────────────────────────────────────────────────── */
const bytes = (...parts) => {
  const flat = [];
  for (const p of parts) {
    if (typeof p === "number") flat.push(p);
    else for (const b of p) flat.push(b & 0xff);
  }
  return new Uint8Array(flat);
};
const rndBytes = (n, seed = 7) => {
  const a = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a[i] = (x >>> 16) & 0xff; }
  return a;
};
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const rep = (b, n) => new Uint8Array(Array.from({ length: n }, () => b));

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], rep(0x41, 512));
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], rep(0x42, 512));
const GIF = bytes(str("GIF89a"), rep(0x43, 512));
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], rep(0x00, 32), str("word/document.xml"), rep(0, 200));
const XLSM = bytes([0x50, 0x4b, 0x03, 0x04], rep(0x00, 24), str("xl/workbook.xml"), rep(0, 8), str("xl/vbaProject.bin"), rep(0, 200));
const MP3 = bytes(str("ID3"), rep(0x44, 400));
const PDF = bytes(str("%PDF-1.7\n"), rep(0x20, 300));
const MP4 = bytes(rep(0, 4), str("ftypisom"), rep(0, 200));
const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01], rep(0, 300));
const EICAR = bytes(str("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!"), rep(0, 64));
const PY = bytes(str("#!/usr/bin/env python3\nprint('hi')\n"));
const SH = bytes(str("#!/bin/bash\nrm -rf /\n"));

describe("أساسيات: الأسماء والامتدادات", () => {
  it("safeName يزيل المسارات وأسماء المحارف الخطرة ويحافظ على الاسم", () => {
    expect(safeName("../../etc/passwd")).toBe("_._etc_passwd");
    expect(safeName('a<b>c:"d|e?f*g')).toBe("a_b_c__d_e_f_g");
    expect(safeName("")).toBe("file");
    expect(safeName(".htaccess")).toBe("htaccess");
    expect(safeName("صورة العيد.png")).toBe("صورة العيد.png");
    expect(safeName("x\u0000\u001fy.png")).toBe("xy.png");
  });

  it("extsOf يقبل الامتداد المزدوج ويحذف الأحرف الغريبة", () => {
    expect(extsOf("invoice.pdf.exe")).toEqual(["pdf", "exe"]);
    expect(extsOf("IMAGE.JPG")).toEqual(["jpg"]);
    expect(extsOf("archive.tar.GZ")).toEqual(["tar", "gz"]);
    expect(extsOf("noext")).toEqual([]);
  });
});

describe("كشف الصيغة الحقيقية (التوقيع السحري)", () => {
  it("صور: PNG/JPG/GIF", () => {
    expect(scan({ name: "a.png", bytes: PNG }).detected.ext).toBe("png");
    expect(scan({ name: "a.jpg", bytes: JPG }).detected.ext).toBe("jpg");
    expect(scan({ name: "a.gif", bytes: GIF }).detected.ext).toBe("gif");
  });

  it("أرشيف/مستند/صوت/فيديو", () => {
    expect(scan({ name: "a.docx", bytes: ZIP }).detected.ext).toBe("docx");
    expect(scan({ name: "a.pdf", bytes: PDF }).detected.ext).toBe("pdf");
    expect(scan({ name: "a.mp3", bytes: MP3 }).detected.ext).toBe("mp3");
    expect(scan({ name: "a.mp4", bytes: MP4 }).detected.ext).toBe("mp4");
  });

  it("التنفيذيات تُكتشف رغم امتداد صورة ⇒ verdict خطر", () => {
    const r = scan({ name: "vacation.jpg", bytes: ELF });
    expect(r.detected.kind).toBe("executable");
    expect(r.verdict).toBe("danger");
    expect(r.blocked).toBe(true);
    expect(r.reasons.map((x) => x.id)).toContain("executable");
    expect(r.reasons.map((x) => x.id)).toContain("mismatch");
  });

  it("امتداد مزدوج مضلِّل (pdf + exe) يُكشف حتى لو كان المحتوى PDF", () => {
    const r = scan({ name: "statement.pdf.exe", bytes: ELF });
    expect(r.verdict).toBe("danger");
    expect(r.reasons.map((x) => x.id)).toContain("doubleExt");
  });

  it("EICAR (نص اختبار مضاد الفيروسات) ⇒ 100 وخطر", () => {
    const r = scan({ name: "note.txt", bytes: EICAR });
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("danger");
    expect(r.reasons.map((x) => x.id)).toContain("eicar");
  });
});

describe("التنفيذي الصريح ليس خطراً بذاته", () => {
  it("setup.exe حقيقي (MZ + امتداد مطابق) ⇒ مراجعة لا خطر ولا حظر", () => {
    const r = scan({ name: "installer.exe", bytes: bytes([0x4d, 0x5a], rep(0x90, 2048)) });
    expect(r.detected.ext).toBe("exe");
    expect(r.reasons.map((x) => x.id)).toContain("executable");
    expect(r.reasons.map((x) => x.id)).not.toContain("mismatch");
    expect(r.reasons.map((x) => x.id)).not.toContain("doubleExt");
    expect(r.verdict).toBe("caution");
    expect(r.blocked).toBe(false);
  });

  it("exe حقيقي معبّأ (إنتروبيا عالية) لا يقفز للخطر — يبقى مراجعة", () => {
    const r = scan({ name: "setup.exe", bytes: bytes([0x4d, 0x5a], rndBytes(4096, 3)) });
    expect(r.entropy).toBeGreaterThan(7);
    expect(r.verdict).toBe("caution");
  });

  it("الخداع يبقى خطراً: محتوى تنفيذي باسم صورة أو امتداد مزدوج", () => {
    expect(scan({ name: "vacation.jpg", bytes: ELF }).verdict).toBe("danger");
    expect(scan({ name: "statement.pdf.exe", bytes: ELF }).verdict).toBe("danger");
  });

  it("DLL سليمة ⇒ مراجعة أيضاً", () => {
    const r = scan({ name: "lib.dll", bytes: bytes([0x4d, 0x5a], rep(0x90, 1024)) });
    expect(r.verdict).toBe("caution");
  });
});

describe("تمييز لغة البرمجة", () => {
  it("من الامتداد", () => {
    expect(scan({ name: "app.tsx", bytes: str("export const a = 1") }).language).toBe("TypeScript (React)");
    expect(scan({ name: "main.py", bytes: PY }).language).toBe("Python");
    expect(scan({ name: "index.html", bytes: str("<!DOCTYPE html><html></html>") }).language).toBe("HTML");
    expect(scan({ name: "lib.rs", bytes: str("fn main(){}") }).language).toBe("Rust");
  });

  it("من shebang بدون امتداد", () => {
    expect(scan({ name: "deploy", bytes: SH }).language).toBe("Shell (Bash)");
    expect(scan({ name: "run", bytes: PY }).language).toBe("Python");
    expect(detectShebang("no shebang here")).toBeNull();
  });

  it("ملف غير برمجي ⇒ بلا لغة", () => {
    expect(scan({ name: "photo.png", bytes: PNG }).language).toBeNull();
  });
});

describe("طبقات الخطر", () => {
  it("ماكرو ⇒ مراجعة", () => {
    const r = scan({ name: "budget.xlsm", bytes: XLSM });
    expect(r.detected.ext).toBe("xlsm");
    expect(r.reasons.map((x) => x.id)).toContain("macro");
    expect(r.verdict).toBe("caution");
  });

  it("docx/xlsx/pptx لا تُبتلع بواسطة توقيع zip العام", () => {
    expect(scan({ name: "s.xlsx", bytes: XLSM }).detected.ext).not.toBe("zip");
    expect(scan({ name: "a.docx", bytes: ZIP }).verdict).toBe("safe");
  });

  it("SVG يحمل سكربتاً ⇒ مراجعة عالية", () => {
    const r = scan({ name: "logo.svg", bytes: str('<svg xmlns="x"><script>alert(1)</script></svg>') });
    expect(r.reasons.map((x) => x.id)).toContain("markupScript");
    expect(r.verdict).not.toBe("safe");
  });

  it("أرشيف يحوي أسماء تنفيذيات ⇒ مراجعة", () => {
    const r = scan({ name: "pack.zip", bytes: bytes([0x50, 0x4b, 0x03, 0x04], rep(0, 8), str("setup.exe\0\0"), rep(0, 200)) });
    expect(r.reasons.map((x) => x.id)).toContain("archiveExec");
  });

  it("سكربت ⇒ مراجعة، وإنتروبيا عالية مع سكربت ⇒ أخطر", () => {
    const plain = scan({ name: "run.sh", bytes: str("#!/bin/bash\necho hi\n") });
    expect(plain.reasons.map((x) => x.id)).toContain("script");
    expect(plain.verdict).toBe("caution");
    const packed = scan({ name: "run.sh", bytes: bytes(str("#!/bin/bash\n"), rndBytes(2048)) });
    expect(packed.reasons.map((x) => x.id)).toContain("packed");
  });

  it("نص فيه بايتات NUL مع امتداد نصي ⇒ ملاحظة", () => {
    const r = scan({ name: "notes.txt", bytes: bytes(str("hello"), [0x00, 0x00], rep(0x41, 64)) });
    expect(r.reasons.map((x) => x.id)).toContain("textBinary");
  });

  it("ملف فارغ ⇒ ملاحظة", () => {
    expect(scan({ name: "empty.png", bytes: new Uint8Array(0), size: 0 }).reasons.map((x) => x.id)).toContain("empty");
  });

  it("صورة نظيفة ⇒ آمن (لا إنذار كاذب من بايتات عشوائية)", () => {
    const r = scan({ name: "photo.png", bytes: PNG });
    expect(r.verdict).toBe("safe");
    expect(r.reasons).toEqual([]);
    expect(r.blocked).toBe(false);
  });

  it("درجة الخطورة ≤ 100 دائماً", () => {
    const r = scan({ name: "bad.pdf.exe.bat", bytes: ELF });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.verdict).toBe("danger");
  });
});

describe("entropy", () => {
  it("نص متكرّر منخفض، عشوائي عالٍ", () => {
    expect(entropy(bytes(str("aaaaaaaaaaaaaaaaaaaa")))).toBeLessThan(1);
    const rnd = new Uint8Array(4096);
    for (let i = 0; i < rnd.length; i++) rnd[i] = (i * 7 + (i % 13) * 29) & 0xff;
    expect(entropy(rnd)).toBeGreaterThan(3);
  });
});

describe("سياسة الاستضافة والرفع", () => {
  it("canHost يرفض التنفيذيات والسكربتات وHTML/SVG", () => {
    for (const n of ["a.exe", "a.bat", "a.ps1", "a.js", "a.html", "a.svg", "noext"]) {
      expect(canHost(n).ok, n).toBe(false);
    }
  });

  it("canHost يقبل الصور/الفيديو/المستندات", () => {
    for (const n of ["a.png", "a.mp4", "a.pdf", "a.zip", "a.mp3"]) {
      expect(canHost(n).ok, n).toBe(true);
    }
  });

  it("canHost يرفض تقريراً مصنَّفاً خطراً", () => {
    const report = scan({ name: "photo.jpg", bytes: ELF });
    expect(canHost("photo.jpg", report).ok).toBe(false);
  });

  it("serveMode: inline للصور/الفيديو، attachment لغيرها", () => {
    expect(serveMode("png")).toBe("inline");
    expect(serveMode("mp4")).toBe("inline");
    expect(serveMode("zip")).toBe("attachment");
    expect(serveMode("pdf")).toBe("inline");
  });
});

describe("سلامة الجداول", () => {
  it("لا امتداد خطير ناقص من القائمة ولا تكرار فيها", () => {
    expect(DANGEROUS_EXTS.has("exe")).toBe(true);
    expect(DANGEROUS_EXTS.has("png")).toBe(false);
    expect(MACRO_EXTS.has("docm")).toBe(true);
    // لا时应报名出现在两组
    const overlap = [...MACRO_EXTS].filter((e) => DANGEROUS_EXTS.has(e));
    expect(overlap).toEqual([]);
  });

  it("كل توقيع يحمل امتداداً ومimestype وتصنيفاً", () => {
    for (const s of SIGNATURES) {
      expect(typeof s.ext, s.ext).toBe("string");
      expect(typeof s.mime, s.ext).toBe("string");
      expect(["image", "video", "audio", "archive", "document", "code", "executable", "font", "data", "system"], s.ext).toContain(s.kind);
    }
  });
});