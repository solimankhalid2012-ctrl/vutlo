/**
 * ⬇️ زر التحميل المتحرك + 🎨 ألوان القرد الطبيعية
 *
 * 1) الزر: نفس عناصر تصميم المستخدم (circle + سهم مقلوب + نص + سهم)،
 *    مربوط بـ/router Link إلى /download، ولا يحمل transform عند الضغط
 *    (cale/translate) حتى لا تضيع النقرة الأولى — نفس قاعدة .btn.
 * 2) الزر مُستبدل في موضع «⬇️ حمّل الآن» (Header) — ديسكتوب وقائمة الجوال.
 * 3) القرد بألوان طبيعية (بني) والبطاقة ما زالت خضراء/سوداء.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";

import AnimatedDownloadButton from "../src/components/common/AnimatedDownloadButton.jsx";
import MonkeyAvatar, { MonkeyHands } from "../src/components/auth/MonkeyAvatar.jsx";

let host = null;
let root = null;

function mount(node) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
}

describe("زر التحميل المتحرك ⬇️", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("يحتوي عناصر التصميم: circle + سهمان + النص", () => {
    const onClick = vi.fn();
    mount(<AnimatedDownloadButton label="حمّل الآن" onClick={onClick} />);
    const btn = host.querySelector(".animated-button");
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("href")).toBe("/download");
    expect(btn.querySelector(".circle")).toBeTruthy();
    expect(btn.querySelector(".arrow--left").textContent).toContain("⬇");
    expect(btn.querySelector(".arrow:not(.arrow--left)").textContent).toContain("⬇");
    expect(btn.textContent).toContain("حمّل الآن");
    act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("variants: sm للهيدر و block لقائمة الجوال", () => {
    mount(
      <>
        <AnimatedDownloadButton variant="sm" label="حمّل الآن" />
        <AnimatedDownloadButton variant="block" label="حمّل الآن" />
      </>
    );
    const [sm, block] = host.querySelectorAll(".animated-button");
    expect(sm.className).toContain("animated-button--sm");
    expect(block.className).toContain("animated-button--block");
  });

  it("Header يستخدم الزر بدل btn-primary-sm/btn-primary لزر «حمّل الآن»", () => {
    const header = readFileSync("src/components/common/Header.jsx", "utf8");
    // نطبّع السطور لأن الـJSX متعدد الأسطر
    const flat = header.replace(/\s+/g, " ");
    expect(flat).toContain('<AnimatedDownloadButton variant="sm"');
    expect(flat).toContain('AnimatedDownloadButton variant="block"');
    expect(header).not.toContain('className="btn-primary-sm">⬇️');
    expect(header).not.toContain('className="btn-primary"');
  });

  it("CSS: ألوان الموقع، ولا scale/transform على الزر نفسه (حماية النقرة الأولى)", () => {
    const css = readFileSync("src/styles/animatedButton.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // greenyellow استُبدل بلوحة الموقع
    expect(css).not.toContain("greenyellow");
    expect(css).toContain("#1db954");
    expect(css).toContain("#212121");
    // الحركة على الدائرة/السهم فقط
    expect(css).toContain("left: calc(100% + 50px)");
    expect(css).toContain("transform: translateX(5px)");
    expect(css).not.toMatch(/\.animated-button:active\s*\{[^}]*scale/);
    expect(css).not.toMatch(/\.animated-button:active\s*\{[^}]*transform/);
  });
});

describe("ألوان القرد الطبيعية 🎨", () => {
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("بلا ألوان خضراء (القرد كان أخضر)", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<><MonkeyAvatar /><MonkeyHands /></>));
    const svg = host.querySelector("svg#monkey");
    const fills = [...host.querySelectorAll("[fill]")].map((n) => n.getAttribute("fill"));
    expect(fills.length).toBeGreaterThan(5);
    for (const f of fills) {
      expect(["#2C6B4A", "#3E8A63", "#A8E6CF"].includes(f), f).toBe(false);
      expect(f.startsWith("#")).toBe(true);
    }
    // فرو بنّي + بشرة فاتحة + أنف داكن
    expect(fills).toContain("#6f4a2b");
    expect(fills).toContain("#c08a5a");
    expect(fills).toContain("#2b1c12");
    expect(svg).toBeTruthy();
  });

  it("شريط الفم في CSS يوافق لون الأنف الداكن", () => {
    const css = readFileSync("src/styles/loginCard.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toContain("#2b1c12");
    // البطاقة ما زالت خضراء/سوداء
    expect(css).toContain("#1db954");
    expect(css).toContain("#0a0e0a");
  });
});
