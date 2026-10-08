// ─────────────────────────────────────────────
// routes/labScanRoutes.js — مسار فحص الملفات (محرك Python + C++)
//
//   POST /api/lab/scan                    { name, size, headB64 }
//          ⇒ تقرير بنفس مخطط shared/fileScan.js (يفحصه الخادم بمحرك
//            Python ثم يعمّقه بـ C++؛ وإن تعذّر المحركان يعود Node لنفس
//            المخطط وتُعلَم الواجهة أن الفحص كان محلياً).
//   GET  /api/lab/scan/status             حالة المحرك (python/cpp)
//
// ملاحظة: هذا الراوتر يركّب محلل JSON الخاص به قبل express.json العام
// (مثل gif-local) وسقفه أعلى قليلاً: 256KB رأس تصل Base64 ⇒ ~350KB.
// ─────────────────────────────────────────────
import express from "express";
import rateLimit from "express-rate-limit";
import { ipKey } from "../config/rateKeys.js";
import { runScan, engineStatus, MAX_HEAD } from "../services/fileScanEngine/engine.js";

const scanLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: Number(process.env.LAB_SCAN_MAX_PER_HOUR || 120),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "فحوصات كثيرة — جرّب بعد قليل" },
});

export const labScanRoutes = express.Router();

labScanRoutes.post(
  "/lab/scan",
  scanLimiter,
  express.json({ limit: "768kb" }),
  async (req, res) => {
    try {
      const b64 = String(req.body?.headB64 || "");
      if (!b64) return res.status(400).json({ error: "لا توجد بيانات للفحص" });

      let head;
      try {
        head = Buffer.from(b64, "base64");
      } catch {
        return res.status(400).json({ error: "عيّنة تالفة" });
      }
      if (head.length === 0) return res.status(400).json({ error: "الملف فارغ" });
      if (head.length > MAX_HEAD) return res.status(413).json({ error: "عيّنة كبيرة جداً" });

      const name = String(req.body?.name || "").slice(0, 160);
      const size = Math.max(0, Math.floor(Number(req.body?.size) || 0)) || head.length;

      const report = await runScan({ name, size, head });
      res.json(report);
    } catch (e) {
      console.error("[lab/scan]", e.message);
      res.status(500).json({ error: "تعذّر الفحص — أعد المحاولة" });
    }
  }
);

labScanRoutes.get("/lab/scan/status", (req, res) => {
  res.json(engineStatus());
});