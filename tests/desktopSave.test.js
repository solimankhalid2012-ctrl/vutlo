/**
 * 💾 الحفظ على سطح المكتب — server/services/desktopSave.js
 * التطبيق يعمل محلياً ⇒ الخادم ينسخ الملف إلى مجلد Desktop لجهاز المستخدم.
 * تغطي: كشف المجلد، التنظيف (لا path traversal)، تفرّد الاسم، والنسخ الفعلي
 * بمجلدات مؤقتة — لا نلمس سطح مكتب المستخدم أثناء الاختبار.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import fs from "fs";
import os from "os";
import path from "path";
import {
  desktopDir,
  jobIdFromFileName,
  uniquePath,
  resolveInDownloads,
  saveToDesktop,
} from "../server/services/desktopSave.js";

let tmp = "";
let downloads = "";
let desktop = "";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vv-desktop-"));
  downloads = path.join(tmp, "downloads");
  desktop = path.join(tmp, "Desktop");
  fs.mkdirSync(downloads, { recursive: true });
  fs.mkdirSync(desktop, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* تجاهُل */ }
});

describe("النقطة في السيرفر", () => {
  const src = readFileSync("server/server.js", "utf8");

  it("مسار /api/save-desktop موجود وموثّق", () => {
    expect(src).toContain('app.post("/api/save-desktop"');
    expect(src).toContain('{ method: "POST", path: "/save-desktop"');
  });

  it("لا يقبل أي ملف بلا مهمة صاحبة (شرط الملكية موجود)", () => {
    const route = src.slice(src.indexOf('app.post("/api/save-desktop"'), src.indexOf('app.post("/api/playlist"'));
    expect(route).toContain("jobIdFromFileName");
    expect(route).toContain("ownsJob");
  });

  it("العميل يرسل اسم الملف", () => {
    const api = readFileSync("src/services/api.js", "utf8");
    expect(api).toContain("export const saveToDesktop");
    expect(api).toContain('"/api/save-desktop"');
  });
});

describe("كشف مجلد سطح المكتب", () => {
  it("يستخدم DESKTOP_DIR إن كان موجوداً (أولوية كاملة)", () => {
    const d = desktopDir({ DESKTOP_DIR: desktop, USERPROFILE: os.tmpdir() });
    expect(d).toBe(desktop);
  });

  it("يستخدم OneDrive\\Desktop إن كان هو الموجّه", () => {
    const one = path.join(tmp, "OneDrive", "Desktop");
    fs.mkdirSync(one, { recursive: true });
    expect(desktopDir({ OneDrive: path.join(tmp, "OneDrive"), USERPROFILE: os.tmpdir() })).toBe(one);
  });

  it("ينشئ المجلد إن لم يكن موجوداً", () => {
    const missing = path.join(tmp, "NewDesktop");
    expect(fs.existsSync(missing)).toBe(false);
    expect(desktopDir({ DESKTOP_DIR: missing, USERPROFILE: os.tmpdir() })).toBe(missing);
    expect(fs.existsSync(missing)).toBe(true);
  });
});

describe("استخراج معرّف المهمة من اسم الملف", () => {
  it("ملف التحميل الأصلي ونواتج الأدوات", () => {
    expect(jobIdFromFileName("job_abc123_x.mp4")).toBe("job_abc123_x");
    expect(jobIdFromFileName("job_abc123_x.webm")).toBe("job_abc123_x");
    expect(jobIdFromFileName("job_abc123_x_converted.mp3")).toBe("job_abc123_x");
    expect(jobIdFromFileName("job_abc123_x_compressed.mp4")).toBe("job_abc123_x");
    expect(jobIdFromFileName("job_abc123_x.gif")).toBe("job_abc123_x");
    expect(jobIdFromFileName("job_abc123_x_palette.png")).toBe("job_abc123_x");
  });

  it("يرفض أي اسم ليس ملف مهمة", () => {
    expect(jobIdFromFileName("secret.pdf")).toBeNull();
    expect(jobIdFromFileName("../../etc/passwd")).toBeNull();
    expect(jobIdFromFileName("")).toBeNull();
    expect(jobIdFromFileName(null)).toBeNull();
  });
});

describe("التنظيف والأمان", () => {
  it("يقبل basename داخل مجلد التنزيل", () => {
    expect(resolveInDownloads("job_a_b.mp4", downloads)).toBe(path.join(downloads, "job_a_b.mp4"));
  });

  it("يرفض الخروج من المجلد (path traversal)", () => {
    for (const bad of ["../secret.mp4", "..\\secret.mp4", "sub/dir.mp4", "..", "."]) {
      expect(() => resolveInDownloads(bad, downloads)).toThrow();
    }
  });

  it("يرفض اسماً فارغاً", () => {
    expect(() => resolveInDownloads("   ", downloads)).toThrow();
  });
});

describe("تفرّد الاسم عند وجود ملف بنفس الاسم", () => {
  it("يضيف (2) ثم (3) بدل الكتابة فوق ملف موجود", () => {
    const taken = new Set([path.join(desktop, "a.mp4"), path.join(desktop, "a (2).mp4")]);
    expect(uniquePath(desktop, "a.mp4", (p) => taken.has(p))).toBe(path.join(desktop, "a (3).mp4"));
  });

  it("يعيد الاسم كما هو إن لم يوجد", () => {
    expect(uniquePath(desktop, "b.mkv", () => false)).toBe(path.join(desktop, "b.mkv"));
  });
});

describe("النسخ إلى سطح المكتب", () => {
  it("ينسخ الملف ويعيد المسار النهائي", () => {
    const src = path.join(downloads, "job_abc123_x.mp4");
    fs.writeFileSync(src, "video-bytes");
    const r = saveToDesktop("job_abc123_x.mp4", { env: { DESKTOP_DIR: desktop }, downloads });
    expect(r.ok).toBe(true);
    expect(r.dir).toBe(desktop);
    expect(r.fileName).toBe("job_abc123_x.mp4");
    expect(fs.readFileSync(r.path, "utf8")).toBe("video-bytes");
    expect(r.size).toBe("video-bytes".length);
  });

  it("نسخة لا نقل: يبقى الملف في مجلد التنزيل (لأدوات MP3/GIF)", () => {
    const src = path.join(downloads, "job_abc123_x.mp4");
    fs.writeFileSync(src, "keep-me");
    const r = saveToDesktop("job_abc123_x.mp4", { env: { DESKTOP_DIR: desktop }, downloads });
    expect(fs.existsSync(src)).toBe(true);
    expect(fs.existsSync(r.path)).toBe(true);
  });

  it("لا يكتب فوق نسخة موجودة", () => {
    fs.writeFileSync(path.join(downloads, "job_abc123_x.mp4"), "new");
    fs.writeFileSync(path.join(desktop, "job_abc123_x.mp4"), "old");
    const r = saveToDesktop("job_abc123_x.mp4", { env: { DESKTOP_DIR: desktop }, downloads });
    expect(r.fileName).toBe("job_abc123_x (2).mp4");
    expect(fs.readFileSync(path.join(desktop, "job_abc123_x.mp4"), "utf8")).toBe("old");
    expect(fs.readFileSync(r.path, "utf8")).toBe("new");
  });

  it("404 لملف غير موجود (انتهت صلاحيته)", () => {
    try {
      saveToDesktop("job_gone_x.mp4", { env: { DESKTOP_DIR: desktop }, downloads });
      throw new Error("كان يجب أن يفشل");
    } catch (e) {
      expect(e.status).toBe(404);
    }
  });

  it("محاولة الخروج من المجلد تفشل قبل أي قراءة/كتابة", () => {
    fs.writeFileSync(path.join(tmp, "outside.mp4"), "nope");
    expect(() => saveToDesktop("../outside.mp4", { env: { DESKTOP_DIR: desktop }, downloads })).toThrow();
    expect(fs.existsSync(path.join(desktop, "outside.mp4"))).toBe(false);
  });
});