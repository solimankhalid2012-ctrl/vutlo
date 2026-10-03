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
    installStaleTabGuard({ reload, pollMs: 0 });
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
    const dispose = installStaleTabGuard({ reload: vi.fn(), pollMs: 0 });
    dispose();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("تنبض الدورية وحدث focus فتعيد تحميل تبويب صديقي", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const fetchMock = vi.fn(async () => ({
      text: async () => '<script src="/assets/index-newsrv99.js"></script>',
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const dispose = installStaleTabGuard({ reload, pollMs: 1000 });

      // 1) نبضة الدورية وهي تبويب مركّز ⇒ يعيد التحميل بلا تفاعل من المستخدم.
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);

      // 2) حدث focus (عودة المستخدم بالنقر بعد نشر جديد).
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
      expect(reload).toHaveBeenCalledTimes(2);

      // 3) التنظيف يوقف الدورية ⇒ لا طلبات بعد التنظيف.
      dispose();
      const calls = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("لا تعيد تحميل نبضة الدورية إن كان التبويب مخفياً", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      installStaleTabGuard({ reload: vi.fn(), pollMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});