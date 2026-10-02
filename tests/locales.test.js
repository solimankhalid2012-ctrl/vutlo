/**
 * توازن ملفات الترجمة: يجب أن تمتلك كل لغة نفس المفاتيح حتى لا تظهر مفاتيح خام.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "src", "locales");

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));

const flatten = (obj, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.add(key);
  }
  return out;
};

describe("locales", () => {
  it("there are 10 locales", () => {
    expect(files.length).toBe(10);
  });

  it("every locale has the same keys as ar.json", () => {
    const base = flatten(load("ar.json"));
    for (const f of files) {
      const keys = flatten(load(f));
      const missing = [...base].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !base.has(k));
      expect({ file: f, missing, extra }).toEqual({ file: f, missing: [], extra: [] });
    }
  });

  it("no empty or non-string values", () => {
    for (const f of files) {
      const walk = (obj, prefix = "") => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object") walk(v, key);
          else {
            expect(typeof v, `${f}:${key}`).toBe("string");
            expect(String(v).trim().length, `${f}:${key}`).toBeGreaterThan(0);
          }
        }
      };
      walk(load(f));
    }
  });
});
