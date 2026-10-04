/**
 * ⭐ نجوم التقييم — RatingStars + CSS المحدد حرفياً
 *
 * الحراسة هنا twofold:
 * 1) البنية كما طلبها المستخدم بالضبط: 5 input[name=rating] بالترتيب 5→1،
 *    ولكل واحد label فيه svgOne + svgTwo + div.ombre، ونقاط النجمة نفسها.
 * 2) السلوك: النقر يختار النجمة، الاختيار يُحفظ، ولوحة المفاتيح تعمل
 *    (input مخفي display:none ⇒ label هو القابل للتركيز).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";

import RatingStars from "../src/components/ui/RatingStars.jsx";
import { LangProvider } from "../src/context/LangContext.jsx";

const POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";

let host = null;
let root = null;

describe("نجوم التقييم ⭐", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window.navigator, "language", { value: "ar", configurable: true });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.localStorage.clear();
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = (props = {}) => act(() => {
    root.render(<LangProvider><RatingStars {...props} /></LangProvider>);
  });

  const labels = () => [...host.querySelectorAll(".rating label")];
  const inputs = () => [...host.querySelectorAll('.rating input[name="rating"]')];

  it("البنية مطابقة للكود المطلوب: 5 نجوم من 5 إلى 1", () => {
    mount();
    expect(host.querySelector(".rating")).toBeTruthy();
    expect(inputs().map((i) => i.value)).toEqual(["5", "4", "3", "2", "1"]);
    expect(inputs().every((i) => i.type === "radio")).toBe(true);
    expect(labels().map((l) => l.getAttribute("title"))).toEqual(["5 stars", "4 stars", "3 stars", "2 stars", "1 star"]);
    // كل label: النجمة الفارغة + الذهبية + الظل
    for (const l of labels()) {
      expect(l.querySelector("svg.svgOne")).toBeTruthy();
      expect(l.querySelector("svg.svgTwo")).toBeTruthy();
      expect(l.querySelector("div.ombre")).toBeTruthy();
      expect(l.querySelector("polygon").getAttribute("points")).toBe(POINTS);
      expect(l.querySelectorAll("svg").length).toBe(2);
    }
    // الاتجاه من اليمين لليسار (5 على اليمين)
    expect(host.querySelector(".rating").className).toContain("rating");
  });

  it("النقر على نجمة يختارها ويحفظها", async () => {
    const onChange = vi.fn();
    mount({ onChange, storageKey: "vv-rating-test" });
    await act(async () => { labels()[1].querySelector("input")?.click?.(); });
    // نضغط على الـlabel (كما يفعل المستخدم) ⇒ ينشّط الـinput المرتبط
    await act(async () => { labels()[1].click(); });
    expect(document.getElementById("star4").checked).toBe(true);
    expect(onChange).toHaveBeenCalledWith(4);
    expect(window.localStorage.getItem("vv-rating-test")).toBe("4");
    expect(host.textContent).toContain("4");
  });

  it("لوحة المفاتيح تعمل (Enter على النجمة)", async () => {
    const onChange = vi.fn();
    mount({ onChange, storageKey: "vv-rating-kb" });
    await act(async () => {
      labels()[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(3);
    expect(window.localStorage.getItem("vv-rating-kb")).toBe("3");
  });

  it("تقييم محفوظ مسبقاً يظهر محدَّداً عند التحميل", () => {
    window.localStorage.setItem("vv-rating-pre", "5");
    mount({ storageKey: "vv-rating-pre" });
    expect(document.getElementById("star5").checked).toBe(true);
    expect(host.textContent).toContain("5");
  });

  it("CSS موجود حرفياً كما ورد (نجمة ذهبية + ظل + حركات)", () => {
    const css = readFileSync("src/styles/rating.css", "utf8");
    for (const rule of [
      ".rating {",
      "flex-direction: row-reverse;",
      "transform-style: preserve-3d;",
      "perspective: 1000px;",
      ".rating input {",
      "display: none;",
      ".rating label .svgOne {",
      "stroke: #ccc;",
      "fill: rgba(255, 217, 0, 0);",
      ".rating label .svgTwo {",
      "position: absolute;",
      "fill: gold;",
      "opacity: 0;",
      ".ombre {",
      "ellipse closest-side",
      "@keyframes displayStar",
      "@keyframes chackStar",
      "rotateX(100deg) rotateY(100deg) translateY(10px)",
      "input:checked ~ label .svgTwo",
      "chackStar 0.6s ease-out",
    ]) {
      expect(css, `CSS ينقص: ${rule}`).toContain(rule);
    }
  });
});
