/**
 * حالة الخيارات المتقدمة يجب أن تكون مصدراً واحداً للحقيقة.
 * المشكلة التي يحمي منها هذا الملف: LinkInput وAdvancedOptions وScheduleBox
 * كانت تملك نسخاً مستقلة من localStorage، فتعديل القص من اللوحة لا يصل
 * إلى الحزمة المُرسلة لأن extra القديم يُطبَّق بعد القراءة.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  useAdvOptions,
  getAdvOptions,
  setAdvOptions,
  ADV_DEFAULTS,
} from "../src/hooks/useAdvOptions.js";

let container;
let root;
const seen = {};

/** نسختان من نفس الـhook — تحاكي LinkInput ولوحة الخيارات في نفس الصفحة */
function Probe({ id }) {
  const { adv } = useAdvOptions();
  seen[id] = adv;
  return null;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

beforeEach(async () => {
  for (const k of Object.keys(seen)) delete seen[k];
  localStorage.clear();
  await act(async () => setAdvOptions(ADV_DEFAULTS));
});

describe("متجر الخيارات المتقدمة", () => {
  it("يبدأ بالقيم الافتراضية", () => {
    expect(getAdvOptions()).toEqual(ADV_DEFAULTS);
  });

  it("تغيير حقل من نسخة يحدّث النسخ الأخرى فوراً", async () => {
    await act(async () => {
      root.render(
        <>
          <Probe id="link" />
          <Probe id="panel" />
        </>,
      );
    });

    await act(async () => setAdvOptions({ trimStart: "0:10" }));

    expect(seen.link.trimStart).toBe("0:10");
    expect(seen.panel.trimStart).toBe("0:10");
  });

  it("يحفظ في localStorage تحت vv-adv", async () => {
    await act(async () => setAdvOptions({ threads: 16 }));
    expect(JSON.parse(localStorage.getItem("vv-adv")).threads).toBe(16);
  });

  it("لا يمسح الحقول المحفوظة عند patch جزئي", async () => {
    await act(async () => setAdvOptions({ trimStart: "0:05", trimEnd: "0:20" }));
    await act(async () => setAdvOptions({ subs: true }));

    const stored = getAdvOptions();
    expect(stored.trimStart).toBe("0:05");
    expect(stored.trimEnd).toBe("0:20");
    expect(stored.subs).toBe(true);
  });

  it("إخفاء نسخة لا يفسد حالة النسخ المتبقية", async () => {
    const solo = createRoot(container.appendChild(document.createElement("div")));
    await act(async () => {
      solo.render(<Probe id="solo" />);
    });

    await act(async () => setAdvOptions({ password: "s3cret" }));
    await act(async () => solo.unmount());

    expect(getAdvOptions().password).toBe("s3cret");
  });
});
