// ══════════════════════════════════════════════════════════════════════════
// fileScanEngine/engine.js — منسّق محرك فحص الملفات Python + C++
//
// سلسلة التدرّج (من الأقوى إلى الاحتياطي):
//   1) C++ (scanner.cpp)   : حقائق بايت خام (انتروبيا كتل، ZIP، PE/ELF، EOI…)
//      يُبنى تلقائياً من MSVC (vcvars64) أو g++/clang++ عند أول طلب ويُخزَّن في
//      مجلد مؤقت بمالت timestamp المصدر (يتجدّد تلقائياً مع أي تعديل).
//   2) Python (scanner.py) : العقل — تقرير كامل بنفس مخطط shared/fileScan.js
//      مع دمج حقائق C++ وإثراءات ذكية (add after image EOI، polyglot أعمق…).
//   3) fallback : shared/fileScan.js نفسه داخل Node (فوري، بلا محرك خارجي).
//
// ضبط بالبيئة:
//   SCAN_ENGINE=off   تعطيل المحرك الخارجي والاكتفاء بـ Node
//   SCAN_PYTHON=…     مسار python (مثلاً C:\Python314\python.exe)
//   SCAN_CXX=…        مترجم C++ (g++/clang++ بصيغة -o؛ أو مسار cl.exe)
// ══════════════════════════════════════════════════════════════════════════

import os from "os";
import path from "path";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { scan as jsScan, safeName } from "../../../shared/fileScan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CPP_SRC = path.join(__dirname, "scanner.cpp");
const PY_SRC = path.join(__dirname, "scanner.py");
const CACHE_DIR = path.join(os.tmpdir(), "vvcppscan");

const MAX_HEAD = 262144;

const CFG = {
  disabled: (process.env.SCAN_ENGINE || "").trim() === "off",
  python: (process.env.SCAN_PYTHON || "").trim(),
  cxx: (process.env.SCAN_CXX || "").trim(),
  cppTimeoutMs: 4500,
  pythonTimeoutMs: 9000,
  buildTimeoutMs: 180000,
  maxWorkers: 2,
};

let pythonCached = null;
let pythonCaching = null;
let cppCached = null;
let cppCaching = null;
let activeWorkers = 0;
const waiting = [];

function probeVersion(cmd, args) {
  try {
    const r = spawnSync(cmd, args ?? ["--version"], {
      encoding: "utf8", timeout: 9000, windowsHide: true,
    });
    if (r.error || r.status !== 0) return null;
    const v = String(r.stdout || r.stderr || "").trim();
    return v || null;
  } catch {
    return null;
  }
}

function resolvePython() {
  if (pythonCaching) return pythonCaching;
  pythonCaching = (async () => {
    if (pythonCached) return pythonCached;
    if (CFG.disabled) return null;
    const candidates = [
      CFG.python && { cmd: CFG.python, extra: [] },
      { cmd: "python", extra: [] },
      { cmd: "py", extra: ["-3"] },
      { cmd: "python3", extra: [] },
    ].filter(Boolean);
    for (const c of candidates) {
      if (!probeVersion(c.cmd, [...c.extra, "--version"])) continue;
      pythonCached = c;
      return c;
    }
    return null;
  })();
  return pythonCaching;
}

function vswherePath() {
  const prog = process.env["ProgramFiles(x86)"];
  const candidates = [
    prog && path.join(prog, "Microsoft Visual Studio", "Installer", "vswhere.exe"),
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function msvcInstallDir() {
  const vs = vswherePath();
  if (!vs) return null;
  try {
    const r = spawnSync(vs, [
      "-latest", "-products", "*",
      "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property", "installationPath",
    ], { encoding: "utf8", timeout: 20000, windowsHide: true });
    const dir = String(r.stdout || "").trim();
    return dir || null;
  } catch {
    return null;
  }
}

function tryBuildMsvc(out) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignore */ }
  const dir = msvcInstallDir();
  if (!dir) return false;
  const vcvars = path.join(dir, "VC", "Auxiliary", "Build", "vcvars64.bat");
  if (!fs.existsSync(vcvars)) return false;
  const bat = path.join(CACHE_DIR, "build-msvc.bat");
  const lines = [
    "@echo off",
    `call "${vcvars}" >nul`,
    `cd /d "${CACHE_DIR}"`,
    `if exist scanner.obj del /q scanner.obj`,
    `cl /nologo /std:c++17 /O2 /EHsc "${CPP_SRC}" /Fe:"${out}" >nul`,
    `if not exist "${out}" exit /b 1`,
    "exit /b 0",
  ];
  try {
    fs.writeFileSync(bat, lines.join("\r\n"), "utf8");
  } catch {
    return false;
  }
  const r = spawnSync("cmd.exe", ["/d", "/c", bat], {
    encoding: "utf8", timeout: CFG.buildTimeoutMs, windowsHide: true,
  });
  return !!r && fs.existsSync(out);
}

function tryCompileCxx(compiler, out) {
  if (!compiler) return false;
  const r = spawnSync(compiler, ["-std=c++17", "-O2", "-o", out, CPP_SRC], {
    encoding: "utf8", timeout: CFG.buildTimeoutMs, windowsHide: true,
  });
  return !r.error && fs.existsSync(out);
}

function resolveCpp() {
  if (cppCaching) return cppCaching;
  cppCaching = (async () => {
    if (cppCached) return cppCached;
    if (CFG.disabled || !fs.existsSync(CPP_SRC)) return null;
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignore */ }
    const stamp = Math.round(fs.statSync(CPP_SRC).mtimeMs);
    const out = path.join(CACHE_DIR, `scanner-${stamp}${process.platform === "win32" ? ".exe" : ""}`);
    if (fs.existsSync(out)) {
      cppCached = out;
      return out;
    }
    const built =
      tryBuildMsvc(out) ||
      tryCompileCxx(CFG.cxx || "g++", out) ||
      tryCompileCxx("clang++", out);
    if (built && fs.existsSync(out)) {
      cppCached = out;
      try {
        const bin = path.basename(out);
        for (const f of fs.readdirSync(CACHE_DIR)) {
          if (/^scanner-\d+\.exe$/.test(f) && f !== bin) {
            try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch { /* ignore */ }
          }
        }
        try { fs.unlinkSync(path.join(CACHE_DIR, "scanner.obj")); } catch { /* ignore */ }
      } catch { /* ignore */ }
      return out;
    }
    return null;
  })();
  return cppCaching;
}

function spawnJson(cmd, args, input, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e) });
      return;
    }
    let out = "";
    let err = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > 3_000_000) { try { child.kill(); } catch { /* ignore */ } }
    });
    child.stderr.on("data", (d) => { err += d; });
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err, timedOut });
    };
    child.on("error", () => finish(-1));
    child.on("close", (code) => finish(code == null ? -1 : code));
    if (input != null && input.length) child.stdin.write(input);
    child.stdin.end();
  });
}

function pLimit(fn) {
  return new Promise((resolve, reject) => {
    waiting.push({ fn, resolve, reject });
    pump();
  });
  function pump() {
    while (activeWorkers < CFG.maxWorkers && waiting.length) {
      const { fn, resolve, reject } = waiting.shift();
      activeWorkers += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => { activeWorkers -= 1; pump(); });
    }
  }
}

async function runScan({ name, size, head }) {
  const bytes = head instanceof Uint8Array ? head : new Uint8Array(head || []);
  const meta = {
    name: safeName(name),
    size: Number(size ?? bytes.length) || 0,
  };

  const py = await pLimit(() => resolvePython());
  if (!py) {
    return { ...jsScan({ name: meta.name, size: meta.size, bytes }), engine: "local" };
  }

  let tmp = null;
  try {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignore */ }
    tmp = fs.mkdtempSync(path.join(CACHE_DIR, "scan-"));
    const headPath = path.join(tmp, "head.bin");
    const capped = bytes.subarray(0, MAX_HEAD);
    fs.writeFileSync(headPath, capped);

    let facts = null;
    const cpp = await pLimit(() => resolveCpp());
    if (cpp && capped.length > 0) {
      const fr = await pLimit(() =>
        spawnJson(cpp, [headPath, String(capped.length)], null, CFG.cppTimeoutMs)
      );
      if (fr.code === 0) {
        try {
          const parsed = JSON.parse(fr.stdout);
          if (parsed && parsed.engine === "cpp") facts = parsed;
        } catch { facts = null; }
      }
    }

    let factsPath = "";
    if (facts) {
      factsPath = path.join(tmp, "facts.json");
      fs.writeFileSync(factsPath, JSON.stringify(facts));
    }

    const input = JSON.stringify(meta);
    const pr = await pLimit(() =>
      spawnJson(py.cmd, [...py.extra, "-u", PY_SRC, headPath, factsPath], input, CFG.pythonTimeoutMs)
    );
    if (pr.code === 0) {
      try {
        const rep = JSON.parse(pr.stdout);
        if (
          rep && typeof rep === "object" &&
          rep.verdict && Array.isArray(rep.reasons) && rep.detected
        ) {
          return { ...rep, engine: rep.engine || "python" };
        }
      } catch { /* report غير صالح */ }
    }
    return { ...jsScan({ name: meta.name, size: meta.size, bytes }), engine: "local" };
  } catch (e) {
    console.error("[scan-engine]", e.message);
    return { ...jsScan({ name: meta.name, size: meta.size, bytes }), engine: "local" };
  } finally {
    if (tmp) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

function engineStatus() {
  return {
    engine: CFG.disabled ? "off" : "python+cpp",
    python: pythonCached ? { cmd: pythonCached.cmd, extra: pythonCached.extra } : null,
    cppBinary: cppCached || null,
    activeWorkers,
    waiting: waiting.length,
  };
}

export { runScan, engineStatus, MAX_HEAD };