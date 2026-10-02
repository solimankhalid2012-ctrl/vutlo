// @vitest-environment node
/**
 * اختبارات أداة التحميل الموحدة: كل ميزة يجب أن تكون قابلة للاختيار
 * قبل الضغط على "تحميل" وأن تُترجم لصيغة يفهمها الخادم.
 * الهدف: ألّا تُدفن ميزة مجدداً خلف شرط لا يراه المستخدم.
 */
import { describe, it, expect } from "vitest";
import {
  TOOLS,
  toolById,
  formatsFor,
  formatForTool,
  qualitiesFor,
  GIF_MAX_HEIGHT,
} from "../src/utils/tools.js";

describe("سجل الأدوات", () => {
  it("يغطي كل ما يعلنه الموقع", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "video", "audio", "gif", "compress", "playlist", "schedule",
    ]);
  });

  it("كل أداة لها أيقونة واسم عربي وإنجليزي ووصف", () => {
    for (const tool of TOOLS) {
      expect(tool.icon, tool.id).toBeTruthy();
      expect(tool.label.ar, tool.id).toBeTruthy();
      expect(tool.label.en, tool.id).toBeTruthy();
      expect(tool.hint.ar, tool.id).toBeTruthy();
      expect(tool.hint.en, tool.id).toBeTruthy();
    }
  });

  it("الأدوات الفردية لها صيغ صالحة؛ المجموعات لا", () => {
    expect(toolById("video").formats).toEqual(["mp4", "webm", "mkv"]);
    expect(toolById("audio").formats).toEqual(["mp3"]);
    expect(toolById("gif").formats).toEqual(["gif"]);
    expect(toolById("playlist").formats).toBeUndefined();
    expect(toolById("schedule").formats).toBeUndefined();
  });

  it("الأداة غير المعروفة ترجع للفيديو (آمنة)", () => {
    expect(toolById("nope").id).toBe("video");
    expect(toolById(undefined).id).toBe("video");
  });
});

describe("اختيار الصيغة حسب الأداة", () => {
  it("الفيديو يحترم اختيار المستخدم ضمن صيغه", () => {
    expect(formatForTool("video", "mkv")).toBe("mkv");
    expect(formatForTool("video", "mp4")).toBe("mp4");
  });

  it("الفيديو يرفض صيغة لا تخصه (مثلاً mp3)", () => {
    expect(formatForTool("video", "mp3")).toBe("mp4");
  });

  it("الصوت ثابت mp3 مهما اختار المستخدم", () => {
    expect(formatForTool("audio", "mp4")).toBe("mp3");
    expect(formatForTool("audio", undefined)).toBe("mp3");
  });

  it("GIF ثابت gif", () => {
    expect(formatForTool("gif", "mp4")).toBe("gif");
  });

  it("الضغط يستخدم صيغ الفيديو", () => {
    expect(formatForTool("compress", "webm")).toBe("webm");
    expect(formatForTool("compress", "mp3")).toBe("mp4");
  });
});

describe("الجودة حسب الأداة", () => {
  it("أدوات الفيديو تعرض كل الجودات", () => {
    expect(qualitiesFor("video").length).toBeGreaterThan(5);
    expect(qualitiesFor("compress").length).toBeGreaterThan(5);
  });

  it("الصوت و GIF بلا اختيار جودة", () => {
    expect(qualitiesFor("audio")).toEqual(["best"]);
    expect(qualitiesFor("gif")).toEqual(["best"]);
  });

  it("GIF محدود داخلياً بـ 480p لحجم معقول", () => {
    expect(GIF_MAX_HEIGHT).toBe(480);
  });
});

describe("الصيغ المتاحة لكل أداة", () => {
  it("تطابق تعريفات الأداة", () => {
    expect(formatsFor("video").map((f) => f.id)).toEqual(["mp4", "webm", "mkv"]);
    expect(formatsFor("audio").map((f) => f.id)).toEqual(["mp3"]);
    expect(formatsFor("gif").map((f) => f.id)).toEqual(["gif"]);
  });

  it("لا تعيد شيئاً لأدوات المجموعات", () => {
    expect(formatsFor("playlist")).toEqual([]);
    expect(formatsFor("schedule")).toEqual([]);
  });

  it("كل صيغة مختارة مدعومة من الخادم", () => {
    const allowed = ["mp4", "webm", "mkv", "mp3", "gif"];
    for (const tool of TOOLS) {
      for (const f of tool.formats || []) {
        expect(allowed, `${tool.id}:${f}`).toContain(f);
      }
    }
  });
});
