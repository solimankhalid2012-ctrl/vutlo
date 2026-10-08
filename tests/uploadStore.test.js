/**
 * 🗄️ مخزن الرفع الدائم — server/services/uploadStore.js
 *
 * نبني بايتات PNG/GIF/ELF حقيقية، ونوجّه UPLOAD_DIR إلى مجلد مؤقت
 * حتى لا يمسّ الاختبار downloads/uploads الحقيقي.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vv-upload-"));
process.env.DOWNLOAD_DIR = TMP;

const store = await import("../server/services/uploadStore.js");
const { canHost, scan: scanUpload } = await import("../shared/fileScan.js");

const bytes = (...parts) => {
  const flat = [];
  for (const p of parts) {
    if (typeof p === "number") flat.push(p);
    else for (const b of p) flat.push(b & 0xff);
  }
  return new Uint8Array(flat);
};
const rep = (b, n) => new Uint8Array(Array.from({ length: n }, () => b));
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], rep(0x41, 600));
const GIF = bytes([...Buffer.from("GIF89a")], rep(0x42, 600));
const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01], rep(0, 400));

afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* تجاهُل */ }
});

beforeAll(() => store.ensureUploadDir());

describe("الرفع البرمجي", () => {
  it("يخزّن ملفاً ويعيد رابطاً دائماً بالشكل /u/<id>", () => {
    const out = store.saveUpload({ name: "صورة.png", bytes: PNG, contentType: "image/png" });
    expect(out.url).toBe(`/u/${out.id}`);
    expect(out.url).toMatch(/^\/u\/[A-Za-z0-9_-]{8,24}$/);
    expect(out.name).toBe("صورة.png");
    expect(out.size).toBe(PNG.length);
    expect(out.mime).toBe("image/png");
    expect(out.mode).toBe("inline");
    expect(fs.existsSync(path.join(store.UPLOAD_DIR, out.file))).toBe(true);
    expect(fs.existsSync(path.join(store.UPLOAD_DIR, `${out.id}.meta.json`))).toBe(true);
  });

  it("اسم القرص لا يحتوي من الاسم الأصلي إلا الامتداد", () => {
    const out = store.saveUpload({ name: "../../windows/system32/cmd .exe.png".replace(".exe", "x"), bytes: PNG });
    expect(out.file).toBe(`${out.id}.png`);
    expect(out.file).not.toContain("..");
    expect(out.file).not.toContain("/");
  });

  it("تقرير المسح يُحفظ مع الملف", () => {
    const out = store.saveUpload({ name: "a.gif", bytes: GIF });
    const rec = store.getUpload(out.id);
    expect(rec.scan.verdict).toBe("safe");
    expect(rec.scan.detected.ext).toBe("gif");
    expect(rec.scan.reasons).toEqual([]);
  });

  it("المسار على القرص مطلق (res.sendFile يرفض النسبية)", () => {
    // ⚠️ خطأ حقيقي: كان UPLOAD_DIR نسبياً ⇒ كل GET /u/:id يرمي 500
    // ("path must be absolute") فتفشل الروابط الدائمة كلها بعد أول رفع.
    const out = store.saveUpload({ name: "abs.png", bytes: PNG });
    const rec = store.getUpload(out.id);
    expect(path.isAbsolute(rec.full)).toBe(true);
    expect(path.isAbsolute(store.UPLOAD_DIR)).toBe(true);
    expect(fs.existsSync(rec.full)).toBe(true);
  });

  it("ملف تنفيذي خلف امتداد صورة يُرفض ولا يُكتب على القرص", () => {
    const before = fs.readdirSync(store.UPLOAD_DIR).length;
    let err = null;
    try {
      store.saveUpload({ name: "harmless.png", bytes: ELF });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.status).toBe(415);
    expect(err.report.verdict).toBe("danger");
    expect(fs.readdirSync(store.UPLOAD_DIR).length).toBe(before);
  });

  it("امتداد خطر (exe) يُرفض حتى لو كان المحتوى صورة نظيفة", () => {
    expect(() => store.saveUpload({ name: "tool.exe", bytes: PNG })).toThrow();
  });

  it("GIF مشتق يأخذ رابطاً خاصاً به ويُسجَّل مصدره", () => {
    const src = store.saveUpload({ name: "clip.mp4", bytes: PNG });
    const gif = store.saveGif({ name: "clip.gif", bytes: GIF, sourceId: src.id });
    expect(gif.url).not.toBe(src.url);
    expect(gif.mime).toBe("image/gif");
    expect(store.getUpload(gif.id).sourceId).toBe(src.id);
  });

  it("الملف الفارغ يُرفض برسالة عربية", () => {
    expect(() => store.saveUpload({ name: "e.png", bytes: new Uint8Array(0) })).toThrow(/فارغ/);
  });
});

describe("قراءة الملفات", () => {
  it("معرّف غير صالح أو غير موجود ⇒ null (بلا رمي)", () => {
    expect(store.getUpload("../../etc/passwd")).toBeNull();
    expect(store.getUpload("short")).toBeNull();
    expect(store.getUpload("AAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("لا يثق بمسار داخل البيانات الوصفية (محاولة خروج من المجلد)", () => {
    const good = store.saveUpload({ name: "a.png", bytes: PNG });
    const metaFile = path.join(store.UPLOAD_DIR, `${good.id}.meta.json`);
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    meta.file = "../secret.png";
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    expect(store.getUpload(good.id)).toBeNull();
    // نعيد الملف السليم للاختبارات التالية
    meta.file = good.file;
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  });

  it("بيانات وصفية تالفة ⇒ null", () => {
    const id = "brokenMeta01";
    fs.writeFileSync(path.join(store.UPLOAD_DIR, `${id}.meta.json`), "{not json");
    expect(store.getUpload(id)).toBeNull();
  });

  it("isValidId", () => {
    expect(store.isValidId("abcdefgh")).toBe(true);
    expect(store.isValidId("ab")).toBe(false);
    expect(store.isValidId("a/b/c/d/e/f")).toBe(false);
    expect(store.isValidId("")).toBe(false);
  });
});

describe("ترويسات العرض", () => {
  it("صورة ⇒ inline + nosniff + تخزين دائم", () => {
    const out = store.saveUpload({ name: "صورة العيد.png", bytes: PNG });
    const h = store.serveHeaders(store.getUpload(out.id));
    expect(h["Content-Disposition"]).toMatch(/^inline;/);
    expect(h["Content-Disposition"]).toContain("filename*=UTF-8''");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });

  it("أرشيف ⇒ attachment", () => {
    const zip = bytes([0x50, 0x4b, 0x03, 0x04], rep(0, 40));
    const out = store.saveUpload({ name: "pack.zip", bytes: zip });
    expect(store.serveHeaders(store.getUpload(out.id))["Content-Disposition"]).toMatch(/^attachment;/);
  });

  it("اسم غير ASCII يُنقّى في الجزء القديم من الترويسة", () => {
    const out = store.saveUpload({ name: "صورة.png", bytes: PNG });
    const cd = store.serveHeaders(store.getUpload(out.id))["Content-Disposition"];
    expect(cd).toMatch(/filename="_+\.png"/);
  });
});

describe("أمان منظّف الاستبقاء", () => {
  it("sweepOldFiles لا يمسّ ملفات الرفع الدائمة (قديمة أو مجلد فرعي)", async () => {
    const { sweepOldFiles, isJobArtifact } = await import("../server/services/retention.js");
    const out = store.saveUpload({ name: "keep.png", bytes: PNG });
    // نُقدّم تاريخ الملف سنتين ليقع تحت أي TTL
    const old = new Date(Date.now() - 730 * 24 * 3600_000);
    try { fs.utimesSync(path.join(store.UPLOAD_DIR, out.file), old, old); } catch { /* تجاهُل */ }
    const { removed } = sweepOldFiles();
    expect(removed).toBe(0);
    expect(fs.existsSync(path.join(store.UPLOAD_DIR, out.file))).toBe(true);
    expect(isJobArtifact(out.file)).toBe(false);
  });
});

describe("السقوف", () => {
  it("زائر 50MB وحساب 200MB افتراضياً (قابلة للضبط)", () => {
    expect(store.UPLOAD_LIMITS.guest).toBe(50 * 1048576);
    expect(store.UPLOAD_LIMITS.user).toBe(200 * 1048576);
    expect(store.UPLOAD_MAX_BYTES).toBe(store.UPLOAD_LIMITS.user);
  });
});

describe("توافق الماسح مع المخزن", () => {
  it("ما يرفضه canHost لا يصل إلى القرص", () => {
    for (const n of ["a.exe", "a.html", "a.svg", "a.php", "a.js"]) {
      const r = scanUpload(n, PNG);
      expect(canHost(n, r).ok, n).toBe(false);
      expect(() => store.saveUpload({ name: n, bytes: PNG }), n).toThrow();
    }
  });

  it("ما يقبله canHost يصل بنجاح", () => {
    for (const n of ["a.png", "a.gif", "a.mp4", "a.pdf"]) {
      expect(canHost(n, scanUpload(n, PNG)).ok, n).toBe(true);
    }
  });
});