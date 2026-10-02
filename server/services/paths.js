// ─────────────────────────────────────────────
// services/paths.js — المصدر الوحيد لمجلد الملفات
// كان معرّفاً في ffmpegService وytdlpService معاً ⇒ تعديل في أحدهما ينسى الآخر.
// ─────────────────────────────────────────────
import fs from "fs";

export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });