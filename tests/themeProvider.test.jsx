/**
 * انحدار لوظيفة مبدّل الوضع: يجب أن يقلب data-theme على <html> فوراً،
 * ويحفظ الاختيار، ويزامنه بين التبويبات — دون وميض (useLayoutEffect).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext.jsx";

function Probe() {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle} data-testid="t">{theme}</button>;
}

let host = null;
let root = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<ThemeProvider><Probe /></ThemeProvider>);
  });
  return host;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("يطبّق الوضع الافتراضي (ليلي) على <html>", () => {
    mount();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("يبدّل إلى النهاري ويطبّقه على <html> فوراً", () => {
    const el = mount();
    const btn = el.querySelector('[data-testid="t"]');
    expect(btn.textContent).toBe("dark");
    act(() => btn.click());
    expect(btn.textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("يحفظ الاختيار في vv-theme", () => {
    const el = mount();
    act(() => el.querySelector('[data-testid="t"]').click());
    expect(window.localStorage.getItem("vv-theme")).toBe("light");
  });

  it("يبدأ من الوضع المحفوظ (تبويب آخر بدأ بالنهاري)", () => {
    window.localStorage.setItem("vv-theme", "light");
    mount();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("يتزامن مع حدث storage من تبويب آخر", () => {
    mount();
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("storage"), { key: "vv-theme", newValue: "light" }),
      );
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});