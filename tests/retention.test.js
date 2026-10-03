/**
 * اختبارات منظّف الاحتفاظ بالملفات (retention.js)
 * الثغرة التي تحرسها: سجل المهمة يُحذف بعد ساعة لكن الملف يبقى على القرص
 * للأبد — نموّ بلا حدّ + رابط عام دائم عبر /files.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { DOWNLOAD_DIR } from "../server/services/paths.js";
import { sweepOldFiles, isJobArtifact, FILE_TTL_MS } from "../server/services/retention.js";

/** اسم ملف فريد لكل اختبار حتى لا يصطدم الملفوف Maverick.
 *  ⚠️ لا بد أن يبدأ بـ`job_`: التنظيف يقتصر على مخرجات التطبيق (isJobArtifact)،
 *  فأي اسم آخر لن يُحذف أصلاً — وهذا ما تحرسه اختبارات النطاق أدناه. */
let tag = "";
const name = (base) => `job_t${tag}_${base}`;
const write = (n, ageMs) => {
  const full = path.join(DOWNLOAD_DIR, n);
  fs.writeFileSync(full, "x".repeat(10));
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(full, when, when); // نقدّم mtime يدوياً
  return full;
};

beforeEach(() => {
  tag = Math.random().toString(36).slice(2, 10);
});
afterEach(() => {
  for (const f of fs.readdirSync(DOWNLOAD_DIR)) {
    if (f.startsWith("job_t")) fs.unlinkSync(path.join(DOWNLOAD_DIR, f));
  }
});

describe("منظّف الملفات — يحدّ القرص ويغلق الرابط العام", () => {
  it("يحذف الملف المنتهي ولا يمسّ الجديد", () => {
    const oldF = write(name("old.mp4"), FILE_TTL_MS + 60_000);
    const newF = write(name("new.mp4"), 60_000); // عمره دقيقة
    const r = sweepOldFiles();
    expect(fs.existsSync(oldF)).toBe(false);
    expect(fs.existsSync(newF)).toBe(true);
    expect(r.removed).toBe(1);
    expect(r.bytes).toBeGreaterThan(0);
  });
  it("لا يحذف ملفاً قيد الكتابة أصلاً (الحدّ بالسماعات)", () => {
    // ffmpeg/yt-dlp قد يكتبان ساعتين: mtime يتجدّد ⇒ نجا
    const busy = write(name("busy.mp4.part"), FILE_TTL_MS - 60_000);
    sweepOldFiles();
    expect(fs.existsSync(busy)).toBe(true);
  });
  it("الحدّ: داخل TTL ينجو وخارجه يُحذف", () => {
    // نتجنّب اختبار "عند الحدّ بالضبط": دقة mtime على القرص (أجزاء من الثانية)
    // تجعله متذبذباً بين Runs ⇒ نختبر هامشاً واضحاً بدل حدّ هشّ.
    const inside = write(name("inside.mp4"), FILE_TTL_MS - 60_000);
    const outside = write(name("outside.mp4"), FILE_TTL_MS + 60_000);
    sweepOldFiles();
    expect(fs.existsSync(inside)).toBe(true);
    expect(fs.existsSync(outside)).toBe(false);
  });
  it("لا يرمي ولا يحذف المجلدات (تنظيف صيانة لا يُسقط الخادم)", () => {
    const dir = path.join(DOWNLOAD_DIR, name("dir"));
    fs.mkdirSync(dir);
    fs.utimesSync(dir, new Date(0), new Date(0));
    expect(() => sweepOldFiles()).not.toThrow();
    expect(fs.existsSync(dir)).toBe(true); // المجلدات لا تُمسّ
    fs.rmdirSync(dir);
  });
  it("ملف مُقفل/محذوف بين الفحص والحذف لا يُسقط المرور", () => {
    const f = write(name("racy.mp4"), FILE_TTL_MS + 60_000);
    fs.unlinkSync(f); // يختفي قبل الفحص
    expect(() => sweepOldFiles()).not.toThrow();
  });
  it("إعداد خاطئ للمدة لا يمسح كل شيء (FILE_TTL_HOURS=0/-1/NaN)", async () => {
    // حدٌّ صفري ⇒ كل تنظيف يمسح ما نزّله المستخدم للتوّ. نتحقق أن الحرس يرفضه.
    for (const bad of ["0", "-1", "abc"]) {
      process.env.FILE_TTL_HOURS = bad;
      vi.resetModules(); // إعادة حساب الوحدة بالقيمة الجديدة
      const fresh = await import("../server/services/retention.js");
      expect(fresh.FILE_TTL_MS, `FILE_TTL_HOURS=${bad}`).toBe(6 * 3600_000);
    }
    delete process.env.FILE_TTL_HOURS;
  });
});

describe("نطاق التنظيف: مخرجات التطبيق فقط", () => {
  it("isJobArtifact يقبل مخرجات yt-dlp وFFmpeg", () => {
    for (const n of [
      "job_muqv8avd_pyv9me.mp4", // تنزيل yt-dlp
      "job_muqv8avd_pyv9me.webm",
      "job_muqv8avd_pyv9me.mp3",
      "job_muqv8avd_pyv9me_converted.mp4", // convertTo
      "job_muqv8avd_pyv9me_converted.gif", // videoToGif
      "job_muqv8avd_pyv9me.mp4.part", // جزئي من تنزيل فاشل
      "job_x.mp4.evil.sh", // داخل نطاق التطبيق ⇒ لنا أن نُنظّفه
    ]) expect(isJobArtifact(n), n).toBe(true);
  });

  it("isJobArtifact يرفض ما ليس من مخرجاتنا", () => {
    for (const n of [
      ".gitkeep", // ⬅ ما حذفه التنظيف سابقاً بالخطأ (ملف متتبَّع في git)
      ".env", "index.html", "config.json",
      "notes.txt", "myjob_x.mp4", // job_ في وسط الاسم لا تكفي
      "job_.mp4", // بلا معرّف
      "job_", "job_-x.mp4", // لا يبدأ الاسم بمعرّف صالح
      "", "JOB_x.mp4", // البادئة حسّاسة لحالة الأحرف
    ]) expect(isJobArtifact(n), n || "(empty)").toBe(false);
  });

  it("التنظيف لا يحذف ملفاً منتهياً لا يبدأ بـjob_", () => {
    // الخلل الحقيقي: downloads/.gitkeep كان يُحذف من الخادم Explorer's Sweeper
    const keep = write(`.gitkeep_${tag}`, FILE_TTL_MS + 60_000);
    const other = write(`other_${tag}.txt`, FILE_TTL_MS + 60_000);
    try {
      sweepOldFiles();
      expect(fs.existsSync(keep), "ملف مخفي يجب ألا يُمس").toBe(true);
      expect(fs.existsSync(other), "ملف foreign يجب ألا يُمس").toBe(true);
    } finally {
      for (const f of [keep, other]) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it("يحذف job_ المنتهية فعلاً (السلوك لم يتغيّر)", () => {
    const j = write(name("sweep.mp4"), FILE_TTL_MS + 60_000);
    const r = sweepOldFiles();
    expect(fs.existsSync(j)).toBe(false);
    expect(r.removed).toBeGreaterThanOrEqual(1);
  });
});