/**
 * انحدار لخطأ "Unexpected end of JSON input" عند مستخدمين يبقون على تبويب قديم:
 * التبويب الذي بقي مفتوحاً عبر نشر نسخة جديدة ظلّ يشغّل كوداً قديماً.
 * هنا نثبت أن الحارس يكتشف اختلاف البصمة ويطلب إعادة تحميل، ولا يطنش
 * عندما تكون البصمة واحدة، وأن بصمة البناء تُقرأ من سكربت الدخول.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installStaleTabGuard, currentBuildId } from "../src/utils/buildStamp.js";

const STORAGE_KEY = "vv-build";

function mountEntry(src = "/assets/index-abc12345.js") {
  document.head.innerHTML = `<script type="module" src="${src}"></script>`;
}

describe("بصمة البناء", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mountEntry();
  });
  afterEach(() => {
    document.head.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("تقرأ اسم البناء من سكربت الدخول", () => {
    expect(currentBuildId()).toBe("abc12345");
  });

  it("ترجع dev بلا سكربت دخول (بيئة التطوير)", () => {
    document.head.innerHTML = "";
    expect(currentBuildId()).toBe("dev");
  });

  it("تسجّل البصمة عند أول زيارة بلا إعادة تحميل", () => {
    const reload = vi.fn();
    installStaleTabGuard({ reload });
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("abc12345");
  });

  it("تعيد التحميل فوراً إذا اختلفت البصمة ⇒ تبويب قديم", () => {
    window.localStorage.setItem(STORAGE_KEY, "oldbuild99");
    const reload = vi.fn();
    installStaleTabGuard({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("abc12345");
  });

  it("لا تتكرر إعادة التحميل في نفس الزيارة", () => {
    window.localStorage.setItem(STORAGE_KEY, "oldbuild99");
    const reload = vi.fn();
    installStaleTabGuard({ reload });
    installStaleTabGuard({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("تغلق مستمع visibilitychange عند التنظيف", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const dispose = installStaleTabGuard({ reload: vi.fn() });
    dispose();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});