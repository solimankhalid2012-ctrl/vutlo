// @vitest-environment node
/**
 * اختبارات محرك yt-dlp: بناء الوسائط وترجمة الأخطاء وحماية الروابط.
 * الهدف: ألّا يعود المستخدم أبداً إلى رسالة "انتهى yt-dlp بالكود 1" المجرّدة.
 */
import { describe, it, expect } from "vitest";
import {
  qualityHeight,
  assertUrl,
  explainFailure,
  buildYtdlpArgs,
  formatDuration,
  toSeconds,
  isUpstreamBlock,
  permissiveSelector,
  relaxFormatArgs,
  isFormatUnavailable,
  parseProgress,
  getJob,
  listJobs,
  queueDownload,
  cancelJob,
} from "../server/services/ytdlpService.js";

const after = (args, flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
};

describe("assertUrl", () => {
  it("يقبل http/https", () => {
    expect(assertUrl("https://youtu.be/abc")).toBe("https://youtu.be/abc");
    expect(assertUrl(" http://example.com/v ")).toBe("http://example.com/v");
  });

  it("يرفض الرابط الفارغ/غير الصالح", () => {
    expect(() => assertUrl("")).toThrow("رابط مفقود");
    expect(() => assertUrl("not-a-url")).toThrow("رابط غير صالح");
  });

  it("يرفض Schemes غير المدعومة (file:)", () => {
    expect(() => assertUrl("file:///C:/Windows/win.ini")).toThrow("يدعم http/https فقط");
  });

  it("يرفض الروابط الطويلة جداً", () => {
    expect(() => assertUrl("https://e.com/" + "a".repeat(2100))).toThrow("الحد 2048");
  });
});

describe("explainFailure", () => {
  const cases = [
    ["ERROR: Sign in to confirm you're not a bot", /Bot Check/],
    ["ERROR: HTTP Error 429: Too Many Requests", /429/],
    ["ERROR: [youtube] x: Private video. Sign in", /private|خاص/],
    ["ERROR: [youtube] x: Video unavailable", /غير متاح/],
    ["ERROR: Requested format is not available", /غير متاحة/],
    ["ERROR: Unsupported URL: https://x.com/a", /غير مدعوم/],
    ["ERROR: ffmpeg is not installed", /FFmpeg/],
    ["ERROR: getaddrinfo failed", /الإنترنت/],
    ["ERROR: No space left on device", /مساحة/],
  ];
  for (const [raw, expected] of cases) {
    it(`يترجم: ${raw.slice(0, 40)}`, () => {
      expect(explainFailure(raw, 1)).toMatch(expected);
    });
  }

  it("عند الكود 1 يعرض آخر سطر خطأ مفيد بدل رسالة عامة", () => {
    const msg = explainFailure("WARNING: something\nERROR: unable to download video data", 1);
    expect(msg).toContain("فشل التحميل");
    expect(msg).toContain("unable to download video data");
  });

  it("لا يعيد رسالة فارغة عند غياب stderr", () => {
    expect(explainFailure("", 1).length).toBeGreaterThan(0);
    expect(explainFailure(null, 2)).toContain("2");
  });
});

describe("buildYtdlpArgs", () => {
  it("يبني مسار الإخراج باسم المهمة", () => {
    const args = buildYtdlpArgs("job_x", { quality: "720p", format: "mp4" });
    expect(after(args, "-o")).toContain("job_x.%(ext)s");
  });

  it("يحمّل الصوت فقط للـ MP3", () => {
    const args = buildYtdlpArgs("job_x", { format: "mp3" });
    expect(after(args, "-f")).toBe("ba/b");
    expect(args).toContain("-x");
    expect(after(args, "--audio-format")).toBe("mp3");
  });

  it("يحدّ ارتفاع الـ GIF بـ 480 لتنفيذ أسرع", () => {
    const args = buildYtdlpArgs("job_x", { format: "gif", quality: "2160p" });
    expect(after(args, "-f")).toContain("height<=480");
  });

  it("يستخدم الارتفاع الصحيح لكل جودة", () => {
    expect(after(buildYtdlpArgs("j", { quality: "360p" }), "-f")).toContain("height<=360");
    expect(after(buildYtdlpArgs("j", { quality: "2160p" }), "-f")).toContain("height<=2160");
    expect(after(buildYtdlpArgs("j", { quality: "غير معروف" }), "-f")).toContain("height<=1080");
  });

  it("يضبط عدد الخيوط بين 1 و16", () => {
    expect(after(buildYtdlpArgs("j", { threads: 99 }), "--concurrent-fragments")).toBe("16");
    expect(after(buildYtdlpArgs("j", { threads: 1 }), "--concurrent-fragments")).toBe("1");
    expect(after(buildYtdlpArgs("j", { threads: "abc" }), "--concurrent-fragments")).toBe("8");
    expect(after(buildYtdlpArgs("j", { threads: 0 }), "--concurrent-fragments")).toBe("8");
  });

  it("يضيف كلمة السر والقص والترجمة عند الطلب", () => {
    const args = buildYtdlpArgs("j", { password: "pw123", trimStart: 10, trimEnd: 60, subs: true });
    expect(after(args, "--video-password")).toBe("pw123");
    expect(after(args, "--download-sections")).toBe("*10-60");
    expect(args).toContain("--write-subs");
  });

  it("يتجاهل الترجمة للـ MP3 (لا فائدة منه)", () => {
    expect(buildYtdlpArgs("j", { format: "mp3", subs: true })).not.toContain("--write-subs");
  });

  it("يرفض الصيغ غير المدعومة", () => {
    expect(() => buildYtdlpArgs("j", { format: "exe" })).toThrow("صيغة غير مدعومة");
  });

  it("يرفض أوقات قص غير رقمية أو معكوسة", () => {
    expect(() => buildYtdlpArgs("j", { trimStart: "abc" })).toThrow("أرقاماً");
    expect(() => buildYtdlpArgs("j", { trimStart: 60, trimEnd: 10 })).toThrow("قبل نهايته");
  });

  it("يقبل قصاً بصيغة mm:ss ويحوّله لثوانٍ", () => {
    const args = buildYtdlpArgs("j", { trimStart: "1:05", trimEnd: "2:30" });
    expect(after(args, "--download-sections")).toBe("*65-150");
  });
});

describe("اختيار ترميز متوافق (تفادي AV1 داخل mp4)", () => {
  it("يطلب avc1/mp4 أولاً لا bv* العام", () => {
    // سببّب شكاوى "الجودة ضعيفة/الملف لا يعمل": bv* كان يختار av1 لأن حجمه
    // أصغر، فيخرج ملف 1080p av1 داخل mp4 لا تشغّله أغلب أجهزة ويندوز/الهواتف.
    const sel = after(buildYtdlpArgs("j1", { url: "https://youtu.be/a", format: "mp4" }), "-f");
    expect(sel).toContain("vcodec^=avc1");
    expect(sel).toContain("ext=mp4");
    expect(sel).not.toMatch(/bv\*/);
    expect(sel).toContain("[height<=1080]");
  });

  it("يفضّل m4a/AAC للصوت داخل حاوية mp4", () => {
    // Opus داخل mp4 لا يشغّله QuickTime وبعض أجهزة أندرويد.
    const sel = after(buildYtdlpArgs("j1", { url: "https://youtu.be/a", format: "mp4" }), "-f");
    expect(sel).toContain("bestaudio[ext=m4a]");
  });

  it("لا يفرض قيود mp4 على webm/mkv", () => {
    const sel = after(buildYtdlpArgs("j1", { url: "https://youtu.be/a", format: "webm" }), "-f");
    expect(sel).not.toContain("vcodec^=avc1");
    expect(sel).toContain("[height<=1080]");
  });

  it("المحدد المتساهل يفضّل avc1 أيضاً بدل bv*", () => {
    expect(permissiveSelector("mp4")).toContain("vcodec^=avc1");
    expect(permissiveSelector("mp4")).not.toMatch(/bv\*/);
    expect(permissiveSelector("mp3")).toBe("ba/b");
    // الاستبدال يحافظ على بقية الوسائط
    const args = buildYtdlpArgs("j1", { url: "https://youtu.be/a", format: "mp4" });
    const relaxed = relaxFormatArgs(args, "mp4");
    expect(after(relaxed, "-f")).toBe(permissiveSelector("mp4"));
    expect(after(relaxed, "--merge-output-format")).toBe("mp4");
    expect(relaxed).toEqual(expect.arrayContaining(["--newline", "--progress"]));
  });
});

describe("تقدّم رتيب (منع قفز النسبة للخلف)", () => {
  const run = (job, lines) => { for (const l of lines) parseProgress(job, l); return job.progress; };

  it("يتقدّم داخل التدفّق الواحد", () => {
    const job = { progress: 0 };
    expect(run(job, ["[download]   5.0% of 10MiB", "[download]  37.7% of 10MiB"])).toBeCloseTo(37.7);
  });

  it("لا يتراجع عند بدء تدفّق الصوت من 0% بعد انتهاء الصورة", () => {
    // الفيديو ينتهي ~100% ثم الصوت يطبع 0%..61% ⇒ بدون الحارس تظهر 81% ثم 61%.
    const job = { progress: 0 };
    expect(run(job, ["[download]  81.0% of 84MiB", "[download]  61.0% of 3.2MiB"])).toBe(81);
  });

  it("يتجاهل الأسطر غير المرتبطة بالتقدّم", () => {
    expect(parseProgress({ progress: 12 }, "[Merger] Merging formats")).toBe(false);
    expect(parseProgress({ progress: 12 }, "")).toBe(false);
    expect(parseProgress({ progress: 12 }, "[download] Destination: v.mp4")).toBe(false);
    // سطر تقدّم حقيقي بلا مساحة بعد [download] — فاصل اختياري
    const job = { progress: 0 };
    expect(parseProgress(job, "[download]12.3% of ~84.3MiB")).toBe(true);
    expect(job.progress).toBeCloseTo(12.3);
  });

  it("يوقف السقف عند 99% حتى تُكمل مرحلة الدمج", () => {
    const job = { progress: 0 };
    expect(run(job, ["[download] 100.0% of 84MiB"])).toBe(99);
  });
});

describe("توحيد صيغة وقت القص", () => {
  it("يقبل الثواني كأرقام أو نصوص", () => {
    expect(toSeconds(10)).toBe("10");
    expect(toSeconds("90")).toBe("90");
    expect(toSeconds(" 45 ")).toBe("45");
  });

  it("يحوّل mm:ss و hh:mm:ss إلى ثوانٍ", () => {
    expect(toSeconds("1:05")).toBe("65");
    expect(toSeconds("01:02:03")).toBe("3723");
  });

  it("يعامل الفراغ كـ«بلا قص»", () => {
    expect(toSeconds("")).toBe("");
    expect(toSeconds(null)).toBe("");
    expect(toSeconds(undefined)).toBe("");
  });

  it("يرفض الصيغ المكسورة بدل تمريرها لـ yt-dlp", () => {
    expect(toSeconds("abc")).toBeNull();
    expect(toSeconds("1:99")).toBeNull();
    expect(toSeconds("1:2:3:4")).toBeNull();
  });
});

describe("تصنيف حجب يوتيوب (أساس إعادة المحاولة)", () => {
  it("يعتبر أخطاء الحظر مؤقتة تستحق إعادة المحاولة", () => {
    for (const raw of [
      "ERROR: HTTP Error 403: Forbidden",
      "ERROR: unable to download: HTTP Error 429: Too Many Requests",
      "ERROR: Sign in to confirm you're not a bot",
      "ERROR: [youtube] ...: Unable to extract player response",
      "ERROR: nsig extraction failed",
    ]) {
      expect(isUpstreamBlock(raw), raw).toBe(true);
    }
  });

  it("لا يعيد المحاولة على أخطاء المستخدم العادية", () => {
    for (const raw of [
      "ERROR: Unsupported URL: https://example.com/",
      "ERROR: Video unavailable",
      "ERROR: Requested format is not available",
    ]) {
      expect(isUpstreamBlock(raw), raw).toBe(false);
    }
  });
});

describe("استخراج ارتفاع الجودة", () => {
  it("يستخرج الارتفاع من كل صيغ الجودة", () => {
    expect(qualityHeight("1080p")).toBe(1080);
    expect(qualityHeight("2160p (4K)")).toBe(2160);
    expect(qualityHeight("4320p (8K)")).toBe(4320);
    expect(qualityHeight("720p")).toBe(720);
  });

  it("يفترض 1080p عند قيمة غائبة أو غير رقمية", () => {
    expect(qualityHeight(undefined)).toBe(1080);
    expect(qualityHeight("best")).toBe(1080);
  });

  it("يقبل كل الجودات بلا سقف (أُزيل حدّ الخطة)", () => {
    expect(qualityHeight("1440p")).toBe(1440);
    expect(qualityHeight("2160p (4K)")).toBe(2160);
    expect(qualityHeight("4320p (8K)")).toBe(4320);
  });
});

describe("formatDuration", () => {
  it("ينسّق الثواني إلى mm:ss / h:mm:ss", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(635)).toBe("10:35");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("يرجع --:-- عند غياب المدة", () => {
    expect(formatDuration(0)).toBe("--:--");
    expect(formatDuration(null)).toBe("--:--");
    expect(formatDuration(undefined)).toBe("--:--");
  });
});

describe("job store", () => {
  // منفذ مغلق محلياً: يفشل yt-dlp فوراً دون انتظار الشبكة
  const fastFail = "http://127.0.0.1:1/nope";

  it("ينشئ مهمة ويعيد معرّفاً ورسالة", async () => {
    const job = await queueDownload(fastFail, { quality: "360p", format: "mp3" });
    expect(job.jobId).toMatch(/^job_/);
    expect(job.format).toBe("mp3");
    expect(typeof job.message).toBe("string");
    expect(listJobs().some((j) => j.jobId === job.jobId)).toBe(true);
    cancelJob(job.jobId);
  });

  it("لا يسرّب العملية أو معرّف المستخدم في الرد العام", async () => {
    const job = await queueDownload(fastFail, { userId: "u_123" });
    const pub = getJob(job.jobId);
    expect(pub.jobId).toBe(job.jobId);
    expect("child" in pub).toBe(false);
    expect("userId" in pub).toBe(false);
    cancelJob(job.jobId);
  });

  it("يرفض الروابط غير الصالحة قبل إنشاء مهمة", async () => {
    await expect(queueDownload("javascript:alert(1)")).rejects.toThrow("يدعم http/https فقط");
    await expect(queueDownload("")).rejects.toThrow("رابط مفقود");
  });

  it("يرفض الصيغ غير المدعومة", async () => {
    await expect(queueDownload(fastFail, { format: "exe" })).rejects.toThrow("صيغة غير مدعومة");
  });

  it("يلغي مهمة جارية", async () => {
    const job = await queueDownload(fastFail);
    expect(cancelJob(job.jobId)).toBe(true);
    expect(getJob(job.jobId).status).toBe("cancelled");
    expect(cancelJob(job.jobId)).toBe(false);
  });
});

describe("الشبكة الآمنة عند عدم توفّر الصيغة", () => {
  it("المحدد المتساهل بلا تقييد ارتفاع ومعه avc1 لـmp4", () => {
    expect(permissiveSelector("mp4")).toBe("bestvideo[vcodec^=avc1][ext=mp4]+bestaudio/bestvideo+bestaudio/best");
    expect(permissiveSelector("mkv")).toBe("bestvideo+bestaudio/best");
    expect(permissiveSelector("webm")).toBe("bestvideo+bestaudio/best");
    expect(permissiveSelector("gif")).toBe("bestvideo+bestaudio/best");
  });

  it("MP3 يظل صوتاً فقط في الوضع المتساهل", () => {
    expect(permissiveSelector("mp3")).toBe("ba/b");
  });

  it("يستبدل قيمة -f فقط ويحفظ بقية الوسائط", () => {
    const args = buildYtdlpArgs("j1", { format: "mp4", quality: "2160p (4K)" });
    expect(after(args, "-f")).toContain("height<=2160");
    const relaxed = relaxFormatArgs(args, "mp4");
    const i = args.indexOf("-f");
    const j = relaxed.indexOf("-f");
    expect(relaxed[j + 1]).toBe(permissiveSelector("mp4"));
    expect(relaxed.slice(0, j)).toEqual(args.slice(0, i));
    expect(relaxed.slice(j + 2)).toEqual(args.slice(i + 2));
    expect(relaxed).toHaveLength(args.length);
  });

  it("لا يغيّر المصفوفة الأصلية", () => {
    const args = buildYtdlpArgs("j2", { format: "mp4" });
    const relaxed = relaxFormatArgs(args, "mp4");
    expect(relaxed).not.toBe(args);
    expect(after(args, "-f")).toContain("height<=");
  });

  it("يتعرّف على خطأ الصيغة غير المتاحة فقط", () => {
    expect(isFormatUnavailable("ERROR: Requested format is not available")).toBe(true);
    expect(isFormatUnavailable("ERROR: unable to extract yt initial data")).toBe(false);
    expect(isFormatUnavailable("")).toBe(false);
  });

  it("يمرّر مسار ffmpeg صريحاً فقط عند ضبط FFMPEG_PATH", () => {
    const args = buildYtdlpArgs("j3", { format: "mp4" });
    const got = after(args, "--ffmpeg-location");
    if (process.env.FFMPEG_PATH) expect(got).toBe(process.env.FFMPEG_PATH);
    else expect(got).toBeNull();
  });
});
