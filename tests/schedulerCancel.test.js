/**
 * ثغرة IDOR في إلغاء الجدولات — cancelSchedule()
 *
 * الفحص القديم للملكية كان يعمل على سجل الذاكرة فقط:
 *   if (rec && userId !== undefined && rec.userId && rec.userId !== userId) return false;
 * فإذا لم تكن المهمة في الذاكرة (أي محفوظة من جلسة سابقة وانتهت/ كانت
 * منتهية أصلاً) ⇒ `rec` undefined ⇒ الفحص يُتجاوَز بالكامل، ثم يُكتب
 * status="cancelled" في القاعدة على أي معرّف يمرّره الزائر.
 *
 * الأثر: أي مستخدم يستطيع تعديل جدولة مستخدم آخر، والرد 200 مقابل 404
 * يكشف وجود المعرّفات (كاشف وجود)، وهو نفس نملك خُدعتRoutes /api/job.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const rows = [];
const updateSchedule = vi.fn(async () => true);
const listSchedules = vi.fn(async () => rows);

vi.mock("../server/services/db.js", () => ({
  db: {
    listSchedules: () => listSchedules(),
    updateSchedule: (id, patch) => updateSchedule(id, patch),
    addSchedule: vi.fn(async () => true),
  },
}));
vi.mock("../server/services/ytdlpService.js", () => ({ queueDownload: vi.fn() }));

const { cancelSchedule, scheduleDownload } = await import("../server/services/schedulerService.js");

const ALICE = "user_alice";
const BOB = "user_bob";

beforeEach(() => {
  rows.length = 0;
  updateSchedule.mockClear();
  listSchedules.mockClear();
});

describe("إلغاء جدولة — الملكية", () => {
  it("سجل موجود في القاعدة فقط: مالكه وحده يلغيه", async () => {
    rows.push({ id: "sch_alice", userId: ALICE, status: "done" });
    expect(await cancelSchedule("sch_alice", BOB)).toBe(false);
    expect(updateSchedule).not.toHaveBeenCalled(); // لم يُكتب شيء
  });

  it("نفس السجل: المالك يلغيه بنجاح", async () => {
    rows.push({ id: "sch_alice", userId: ALICE, status: "done" });
    expect(await cancelSchedule("sch_alice", ALICE)).toBe(true);
    expect(updateSchedule).toHaveBeenCalledWith("sch_alice", { status: "cancelled" });
  });

  it("الأدمن (userId === undefined) يملك صلاحية الكل", async () => {
    rows.push({ id: "sch_alice", userId: ALICE, status: "done" });
    expect(await cancelSchedule("sch_alice", undefined)).toBe(true);
  });

  it("مهمة بلا مالك يلغيها أي زائر (نفس قاعدة العرض)", async () => {
    rows.push({ id: "sch_guest", userId: null, status: "pending" });
    expect(await cancelSchedule("sch_guest", BOB)).toBe(true);
  });

  it("معرّف غير موجود ⇒ false بلا كتابة", async () => {
    expect(await cancelSchedule("sch_nope", BOB)).toBe(false);
    expect(updateSchedule).not.toHaveBeenCalled();
  });

  it("سجل في الذاكرة: intruder مرفوض أيضاً", async () => {
    const rec = scheduleDownload({
      url: "https://example.com/v",
      runAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: ALICE,
    });
    expect(await cancelSchedule(rec.id, BOB)).toBe(false);
    expect(await cancelSchedule(rec.id, ALICE)).toBe(true);
  });
});