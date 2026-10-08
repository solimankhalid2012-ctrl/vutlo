#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════
# fileScanEngine/scanner.py — عقل محرك فحص الملفات (Python)
#
# يستقبل رأس الملف (بايتات) عبر: scanner.py <headPath> [factsPath]
# وبيانات الاسم/الحجم عبر JSON على stdin: { "name": ..., "size": ... }
# ويطبع JSON بتقرير مطابق لمخطط shared/fileScan.js تماماً (نفس الحقول
# والعبارات والتصنيفات) حتى تعمل واجهة ScanReport بلا تغيير، مع حقول
# إضافية: engine ("python+cpp" / "python") وإثراءات ذكية من حقائق C++
# لو وُجدت: محتوى مضافة بعد نهاية الصورة، تنفيذية على إزاحات أعمق،
# أسماء تنفيذية داخل ZIP، وVBA مدفون في حاوية.
# ══════════════════════════════════════════════════════════════════════════

import json
import math
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

SCAN_HEAD_BYTES = 262144

# ── أدوات بايت ──────────────────────────────────────────────────────────

def has(b, off, arr):
    if off + len(arr) > len(b):
        return False
    return b[off:off + len(arr)] == bytes(arr)

def ascii_at(b, off, n=1):
    return b[off:off + n]

def latin1(b, n):
    return b[:n].decode("latin-1", "replace")

def decode_utf8(b, n):
    return b[:n].decode("utf-8", "replace")

def entropy(b):
    if not b or len(b) == 0:
        return 0.0
    counts = [0] * 256
    for c in b:
        counts[c] += 1
    h = 0.0
    n = float(len(b))
    for c in counts:
        if not c:
            continue
        p = c / n
        h -= p * math.log2(p)
    return math.floor(h * 1000 + 0.5) / 1000  # مطابقةً مع Math.round في JS

# ── التوقيعات السحرية (مرآة shared/fileScan.js) ────────────────────────

def _svg(b): return bool(re.match(r'\s*(<\?xml|<!DOCTYPE svg|<svg)', decode_utf8(b, 512)))
def _html(b): return bool(re.match(r'\s*(<!DOCTYPE html|<html|<head|<body)', decode_utf8(b, 512)))
def _json(b): return bool(re.match(r'\s*[\[{]', decode_utf8(b, 64)))
def _xml(b): return bool(re.match(r'\s*<\?xml', decode_utf8(b, 128)))

def _gif(b): return ascii_at(b, 0, 6) in (b"GIF87a", b"GIF89a")

SIGNATURES = [
    ("exe", "executable", "application/x-msdownload", "ملف تنفيذي لويندوز", "Windows executable", lambda b: has(b, 0, [0x4d, 0x5a])),
    ("dll", "executable", "application/x-msdownload", "مكتبة DLL", "DLL library", lambda b: has(b, 0, [0x4d, 0x5a])),
    ("elf", "executable", "application/x-executable", "ملف تنفيذي لينكس", "ELF executable", lambda b: has(b, 0, [0x7f, 0x45, 0x4c, 0x46])),
    ("macho", "executable", "application/x-mach-binary", "ملف تنفيذي macOS/iOS", "Mach-O binary", lambda b: has(b, 0, [0xfe, 0xed, 0xfa]) or has(b, 0, [0xcf, 0xfa, 0xed, 0xfe]) or has(b, 0, [0xca, 0xfe, 0xba, 0xbe])),
    ("class", "executable", "application/java-vm", "كود جافا مترجم", "Java class", lambda b: has(b, 0, [0xca, 0xfe, 0xba, 0xbe]) and (len(b) > 7 and b[7] == 0)),
    ("dex", "executable", "application/octet-stream", "ملف Dalvik (أندرويد)", "Dalvik DEX", lambda b: ascii_at(b, 0, 4) == b"dex\n"),
    ("wasm", "executable", "application/wasm", "وحدة WebAssembly", "WebAssembly module", lambda b: has(b, 0, [0x00, 0x61, 0x73, 0x6d])),
    ("apk", "archive", "application/vnd.android.package-archive", "حزمة أندرويد APK", "Android package", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and b"AndroidManifest" in latin1(b, 4096)),
    ("msi", "executable", "application/x-msi", "حزمة تثبيت ويندوز", "Windows installer", lambda b: has(b, 0, [0xd0, 0xcf, 0x11, 0xe0])),
    ("png", "image", "image/png", "صورة PNG", "PNG image", lambda b: has(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ("jpg", "image", "image/jpeg", "صورة JPEG", "JPEG image", lambda b: has(b, 0, [0xff, 0xd8, 0xff]) and (len(b) > 2 and b[2] == 0xff)),
    ("gif", "image", "image/gif", "صورة GIF", "GIF image", _gif),
    ("webp", "image", "image/webp", "صورة WebP", "WebP image", lambda b: ascii_at(b, 0, 4) == b"RIFF" and ascii_at(b, 8, 4) == b"WEBP"),
    ("bmp", "image", "image/bmp", "صورة BMP", "BMP image", lambda b: has(b, 0, [0x42, 0x4d])),
    ("tiff", "image", "image/tiff", "صورة TIFF", "TIFF image", lambda b: has(b, 0, [0x49, 0x49, 0x2a, 0x00]) or has(b, 0, [0x4d, 0x4d, 0x00, 0x2a])),
    ("ico", "image", "image/x-icon", "أيقونة ICO", "ICO icon", lambda b: has(b, 0, [0x00, 0x00, 0x01, 0x00]) or has(b, 0, [0x00, 0x00, 0x02, 0x00])),
    ("heic", "image", "image/heic", "صورة HEIC (آيفون)", "HEIC image", lambda b: ascii_at(b, 4, 4) == b"ftyp" and bool(re.search(r"heic|heix|mif1", latin1(b[8:16], 8)))),
    ("avif", "image", "image/avif", "صورة AVIF", "AVIF image", lambda b: ascii_at(b, 4, 4) == b"ftyp" and bool(re.search(r"avif|mif1", latin1(b[8:16], 8)))),
    ("svg", "image", "image/svg+xml", "صورة SVG (نص)", "SVG vector image", _svg),
    ("psd", "image", "image/vnd.adobe.photoshop", "ملف فوتوشوب PSD", "Photoshop PSD", lambda b: has(b, 0, [0x38, 0x42, 0x50, 0x53])),
    ("mp4", "video", "video/mp4", "فيديو MP4", "MP4 video", lambda b: ascii_at(b, 4, 4) == b"ftyp"),
    ("mov", "video", "video/quicktime", "فيديو QuickTime", "QuickTime video", lambda b: ascii_at(b, 4, 4) == b"ftyp" and bool(re.search(r"qt", latin1(b[8:12], 4)))),
    ("m4v", "video", "video/x-m4v", "فيديو M4V", "M4V video", lambda b: ascii_at(b, 4, 4) == b"ftyp"),
    ("3gp", "video", "video/3gpp", "فيديو 3GP", "3GP video", lambda b: ascii_at(b, 4, 4) == b"ftyp" and bool(re.search(r"3gp", latin1(b[8:16], 8)))),
    ("webm", "video", "video/webm", "فيديو WebM/MKV", "WebM/Matroska video", lambda b: has(b, 0, [0x1a, 0x45, 0xdf, 0xa3])),
    ("mkv", "video", "video/x-matroska", "فيديو Matroska", "Matroska video", lambda b: has(b, 0, [0x1a, 0x45, 0xdf, 0xa3])),
    ("flv", "video", "video/x-flv", "فيديو FLV", "Flash video", lambda b: has(b, 0, [0x46, 0x4c, 0x56, 0x01])),
    ("avi", "video", "video/x-msvideo", "فيديو AVI", "AVI video", lambda b: ascii_at(b, 0, 4) == b"RIFF" and ascii_at(b, 8, 4) == b"AVI "),
    ("wmv", "video", "video/x-ms-wmv", "فيديو WMV", "WMV video", lambda b: has(b, 0, [0x30, 0x26, 0xb2, 0x75])),
    ("mpeg", "video", "video/mpeg", "فيديو MPEG", "MPEG video", lambda b: has(b, 0, [0x00, 0x00, 0x01, 0xba])),
    ("mp3", "audio", "audio/mpeg", "صوت MP3", "MP3 audio", lambda b: ascii_at(b, 0, 3) == b"ID3" or (has(b, 0, [0xff, 0xfb]) and (b[1] & 0xe0) == 0xe0 if len(b) > 1 else False)),
    ("wav", "audio", "audio/wav", "صوت WAV", "WAV audio", lambda b: ascii_at(b, 0, 4) == b"RIFF" and ascii_at(b, 8, 4) == b"WAVE"),
    ("flac", "audio", "audio/flac", "صوت FLAC", "FLAC audio", lambda b: ascii_at(b, 0, 4) == b"fLaC"),
    ("ogg", "audio", "audio/ogg", "صوت OGG", "OGG audio", lambda b: ascii_at(b, 0, 4) == b"OggS"),
    ("aac", "audio", "audio/aac", "صوت AAC", "AAC audio", lambda b: has(b, 0, [0xff, 0xf1]) or has(b, 0, [0xff, 0xf9])),
    ("m4a", "audio", "audio/mp4", "صوت M4A", "M4A audio", lambda b: ascii_at(b, 4, 4) == b"ftyp" and bool(re.search(r"M4A", latin1(b[8:16], 8)))),
    ("opus", "audio", "audio/opus", "صوت Opus", "Opus audio", lambda b: ascii_at(b, 0, 8) == b"OggS" and "OPUS" in latin1(b, 128)),
    ("mid", "audio", "audio/midi", "ملف MIDI", "MIDI audio", lambda b: ascii_at(b, 0, 4) == b"MThd"),
    ("zip", "archive", "application/zip", "أرشيف ZIP", "ZIP archive", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) or has(b, 0, [0x50, 0x4b, 0x05, 0x06])),
    ("gz", "archive", "application/gzip", "أرشيف GZIP", "GZIP archive", lambda b: has(b, 0, [0x1f, 0x8b])),
    ("bz2", "archive", "application/x-bzip2", "أرشيف BZIP2", "BZIP2 archive", lambda b: has(b, 0, [0x42, 0x5a, 0x68])),
    ("xz", "archive", "application/x-xz", "أرشيف XZ", "XZ archive", lambda b: has(b, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])),
    ("zst", "archive", "application/zstd", "أرشيف Zstandard", "Zstandard archive", lambda b: has(b, 0, [0x28, 0xb5, 0x2f, 0xfd])),
    ("7z", "archive", "application/x-7z-compressed", "أرشيف 7-Zip", "7-Zip archive", lambda b: has(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])),
    ("rar", "archive", "application/vnd.rar", "أرشيف RAR", "RAR archive", lambda b: has(b, 0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])),
    ("tar", "archive", "application/x-tar", "أرشيف TAR", "TAR archive", lambda b: ascii_at(b, 257, 5) == b"ustar"),
    ("iso", "system", "application/x-iso9660-image", "صورة قرص ISO", "ISO disk image", lambda b: len(b) > 32774 and b[32769:32774] == b"CD001"),
    ("pdf", "document", "application/pdf", "مستند PDF", "PDF document", lambda b: ascii_at(b, 0, 5) == b"%PDF-"),
    ("rtf", "document", "application/rtf", "مستند RTF", "RTF document", lambda b: ascii_at(b, 0, 5) == b"{\\rtf"),
    ("docx", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "مستند Word (docx)", "Word document", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "word/" in latin1(b, 4096)),
    ("docm", "document", "application/vnd.ms-word.document.macroEnabled.12", "مستند Word بماكرو", "Word document with macros", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "word/" in latin1(b, 4096) and bool(re.search(r"vbaProject", latin1(b, 8192), re.I))),
    ("xlsx", "document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "جدول Excel (xlsx)", "Excel workbook", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "xl/" in latin1(b, 4096)),
    ("xlsm", "document", "application/vnd.ms-excel.sheet.macroEnabled.12", "جدول Excel بماكرو", "Excel workbook with macros", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "xl/" in latin1(b, 4096) and bool(re.search(r"vbaProject", latin1(b, 8192), re.I))),
    ("pptx", "document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "عرض PowerPoint", "PowerPoint deck", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "ppt/" in latin1(b, 4096)),
    ("pptm", "document", "application/vnd.ms-powerpoint.presentation.macroEnabled.12", "عرض PowerPoint بماكرو", "PowerPoint deck with macros", lambda b: has(b, 0, [0x50, 0x4b, 0x03, 0x04]) and "ppt/" in latin1(b, 4096) and bool(re.search(r"vbaProject", latin1(b, 8192), re.I))),
    ("doc", "document", "application/msword", "مستند Word قديم", "Legacy Word document", lambda b: has(b, 0, [0xd0, 0xcf, 0x11, 0xe0])),
    ("sqlite", "data", "application/vnd.sqlite3", "قاعدة بيانات SQLite", "SQLite database", lambda b: ascii_at(b, 0, 15) == b"SQLite format 3"),
    ("ttf", "font", "font/ttf", "خط TrueType", "TrueType font", lambda b: has(b, 0, [0x00, 0x01, 0x00, 0x00, 0x00]) or ascii_at(b, 0, 4) == b"true"),
    ("otf", "font", "font/otf", "خط OpenType", "OpenType font", lambda b: ascii_at(b, 0, 4) == b"OTTO"),
    ("woff", "font", "font/woff", "خط WOFF", "WOFF font", lambda b: ascii_at(b, 0, 4) == b"wOFF"),
    ("woff2", "font", "font/woff2", "خط WOFF2", "WOFF2 font", lambda b: ascii_at(b, 0, 4) == b"wOF2"),
    ("html", "code", "text/html", "صفحة HTML", "HTML page", _html),
    ("json", "code", "application/json", "ملف JSON", "JSON data", _json),
    ("xml", "code", "application/xml", "ملف XML", "XML data", _xml),
]

# ── مجموعات ومجموعات الامتدادات (مرآة) ──────────────────────────────────

DANGEROUS_EXTS = {
    "exe", "dll", "scr", "pif", "cpl", "msi", "com", "sys", "drv", "ocx", "cpl",
    "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "hta",
    "js", "mjs", "cjs", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm",
    "iso", "img", "vhd", "vhdx", "mdf", "reg", "lnk", "url", "chm", "shs",
    "swf", "xll", "mdb", "accde", "psdxml", "one", "pub", "jnlp", "apk", "xapk",
}

MACRO_EXTS = {"docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam", "xlsb"}

SCRIPT_EXTS = {"sh", "bash", "zsh", "py", "rb", "pl", "php", "ps1", "bat", "cmd", "vbs", "lua", "r", "tcl"}

EICAR_RE = re.compile(r"X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!")

MARKUP_SCRIPT_RE = re.compile(r"<script|javascript:|on(load|error|click)\s*=", re.I)
ARCHIVE_EXEC_RE = re.compile(r"\.(exe|dll|scr|bat|cmd|ps1|vbs|js|hta|msi|com|jar|scr)\b", re.I)
ZIP_EXEC_RE = re.compile(r"\.(exe|dll|scr|bat|cmd|ps1|vbs|hta|msi|com|jar|url|lnk|vbe|jse|wsf)$", re.I)

EXT_INFO = {
    "js": ["code", "JavaScript"], "mjs": ["code", "JavaScript"], "cjs": ["code", "JavaScript"],
    "jsx": ["code", "JavaScript (React)"], "ts": ["code", "TypeScript"], "tsx": ["code", "TypeScript (React)"],
    "py": ["code", "Python"], "pyc": ["code", "Python (compiled)"], "rb": ["code", "Ruby"], "php": ["code", "PHP"],
    "go": ["code", "Go"], "rs": ["code", "Rust"], "java": ["code", "Java"], "kt": ["code", "Kotlin"],
    "swift": ["code", "Swift"], "c": ["code", "C"], "h": ["code", "C/C++ header"], "cpp": ["code", "C++"],
    "cc": ["code", "C++"], "hpp": ["code", "C++ header"], "cs": ["code", "C#"], "fs": ["code", "F#"],
    "lua": ["code", "Lua"], "pl": ["code", "Perl"], "r": ["code", "R"], "jl": ["code", "Julia"],
    "dart": ["code", "Dart"], "ex": ["code", "Elixir"], "exs": ["code", "Elixir"], "erl": ["code", "Erlang"],
    "hs": ["code", "Haskell"], "ml": ["code", "OCaml"], "clj": ["code", "Clojure"], "scala": ["code", "Scala"],
    "groovy": ["code", "Groovy"], "vue": ["code", "Vue"], "svelte": ["code", "Svelte"],
    "html": ["code", "HTML"], "htm": ["code", "HTML"], "css": ["code", "CSS"], "scss": ["code", "Sass/SCSS"],
    "json": ["code", "JSON"], "xml": ["code", "XML"], "yml": ["code", "YAML"], "yaml": ["code", "YAML"],
    "toml": ["code", "TOML"], "ini": ["code", "INI"], "sh": ["code", "Shell (Bash)"], "bash": ["code", "Shell (Bash)"],
    "ps1": ["code", "PowerShell"], "bat": ["code", "Batch"], "cmd": ["code", "Batch"], "sql": ["code", "SQL"],
    "md": ["document", "Markdown"], "txt": ["document", "نص عادي"], "log": ["document", "سجل نصي"],
    "csv": ["data", "CSV"], "jsonl": ["data", "JSON Lines"], "db": ["data", "قاعدة بيانات"], "sqlite": ["data", "SQLite"],
    "doc": ["document", "Word (قديم)"], "docx": ["document", "Word"], "xls": ["document", "Excel (قديم)"],
    "xlsx": ["document", "Excel"], "ppt": ["document", "PowerPoint (قديم)"], "pptx": ["document", "PowerPoint"],
    "odt": ["document", "OpenDocument Text"], "rtf": ["document", "RTF"], "pdf": ["document", "PDF"], "epub": ["document", "EPUB"],
}

BINARY_CONTAINERS = {"zip", "docx", "docm", "xlsx", "xlsm", "pptx", "pptm", "apk", "epub", "jar", "gzip", "7z", "rar", "exe", "elf", "macho", "dex", "class", "wasm", "sqlite"}
CONTAINER_FIRST = ["apk", "docm", "docx", "xlsm", "xlsx", "pptm", "pptx", "epub"]
RISKY_SIGS = {"exe", "elf", "macho", "dex", "class", "wasm"}

SIG_BY_EXT = {s[0]: s for s in SIGNATURES}

def ext_kind(ext):
    if not ext:
        return None
    s = SIG_BY_EXT.get(ext)
    return s[1] if s else None

# ── أسماء/امتدادات ──────────────────────────────────────────────────────

CTRL_RE = re.compile(r"[\x00-\x1f\x7f\u200b-\u200f\u2028\u2029\ufeff]")
BAD_CHARS_RE = re.compile(r'[\\/<>:"|?*]')

def safe_name(name):
    s = CTRL_RE.sub("", str(name or ""))
    s = BAD_CHARS_RE.sub("_", s)
    s = re.sub(r"^[.\s]+", "", s)
    s = re.sub(r"\.{2,}", ".", s)
    s = re.sub(r"\s+", " ", s).strip()[:120]
    return s or "file"

def exts_of(name):
    base = safe_name(name).split(".")[1:]
    out = []
    for e in base:
        if not e:
            continue
        out.append(re.sub(r"[^a-z0-9]", "", e.lower()))
    return out

# ── shebang / لغة ───────────────────────────────────────────────────────

def detect_shebang(text):
    line = str(text or "")[:120]
    if not line.startswith("#!"):
        return None
    if "python" in line:
        return "Python"
    if re.search(r"\b(bash|sh|zsh|dash)\b", line):
        return "Shell (Bash)"
    if re.search(r"\bnode\b", line):
        return "JavaScript (Node)"
    if re.search(r"\bruby\b", line):
        return "Ruby"
    if re.search(r"\bperl\b", line):
        return "Perl"
    if re.search(r"\bphp\b", line):
        return "PHP"
    if re.search(r"\blua\b", line):
        return "Lua"
    return "سكربت (shebang)"

# ── التشخيص ─────────────────────────────────────────────────────────────

def detect_sig(b):
    for want in CONTAINER_FIRST:
        s = SIG_BY_EXT.get(want)
        if not s:
            continue
        try:
            if s[5](b):
                return s
        except Exception:
            pass
    for s in SIGNATURES:
        try:
            if s[5](b):
                return s
        except Exception:
            pass
    return None

VERDICT_TEXT = {
    "safe": {"ar": "آمن — لا توجد مؤشرات خطر", "en": "Safe — no risk indicators found"},
    "caution": {"ar": "يحتاج مراجعة — هناك مؤشرات تستدعي الحذر", "en": "Needs review — indicators require caution"},
    "danger": {"ar": "خطر — لا ترفع/لا تشغّل هذا الملف", "en": "Danger — do not upload or run this file"},
}

DISCLAIMER = {
    "ar": "هذا فحص هيكلي وإحصائي للتوقيعات والانتروبيا، وليس بديلاً عن مضاد فيروسات كامل.",
    "en": "This is a structural/heuristic scan (signatures + entropy), not a full antivirus replacement.",
}

REASONS = []

def add_reason(rid, weight, ar, en):
    REASONS.append({"id": rid, "weight": weight, "ar": ar, "en": en})

def reason_ids():
    return {r["id"] for r in REASONS}

# ── القواعد الأساسية (مرآة shared/fileScan.js) ──────────────────────────

def base_rules(name, size, b, sig, declared_kind, declared_label, ext, head_text, raw_text, head):
    list_ = exts_of(name)
    ent = entropy(head)
    honest = False
    if sig and sig[1] == "executable":
        honest = bool(ext) and (sig[0] == ext or ext_kind(ext) == "executable")
        if honest:
            add_reason("executable", 40, f"ملف تنفيذي فعلي (.{ext}) — لا تشغّله إلا من مصدر موثوق", f"Real executable (.{ext}) — run only from a trusted source")
        else:
            add_reason("executable", 70, f"محتوى تنفيذي فعلي ({sig[3]}) رغم الامتداد .{ext or '؟'}", f"Real executable content ({sig[4]}) despite the .{ext or '?'} extension")

    if len(list_) >= 2 and DANGEROUS_EXTS and list_[-1] in DANGEROUS_EXTS and list_[0] not in DANGEROUS_EXTS:
        add_reason("doubleExt", 85, f"امتداد مزدوج مضلِّل: .{list_[0]} ثم .{list_[-1]}", f"Deceptive double extension: .{list_[0]} then .{list_[-1]}")

    if ext in DANGEROUS_EXTS and not (sig and sig[1] == "executable"):
        add_reason("dangerExt", 70, f"امتداد تنفيذ/خطير (.{ext}) لا يمكن التحقق منه بأمان", f"Dangerous extension (.{ext}) that cannot be verified as safe")

    if ext in MACRO_EXTS:
        add_reason("macro", 55, f"مستند يحتوي ماكرو ({ext.upper()}) قد ينفّذ كوداً", f"Macro-enabled document ({ext.upper()}) can run code")

    if ext in SCRIPT_EXTS:
        add_reason("script", 35, f"سكربت قابل للتنفيذ (.{ext})", f"Executable script (.{ext})")

    sig_kind = sig[1] if sig else None
    kind_match = False
    if sig and ext and declared_kind != "unknown":
        kind_match = (sig_kind == declared_kind or
                      (sig_kind == "video" and declared_kind == "video") or
                      (sig_kind == "archive" and declared_kind in ("archive", "document", "data", "executable")) or
                      (sig_kind == "code" and declared_kind in ("code", "document", "data")) or
                      (sig_kind == "system" and declared_kind in ("archive", "data", "document")))
    if sig and ext and declared_kind != "unknown" and not kind_match:
        add_reason("mismatch", 60, f"المحتوى {sig[3]} لا يطابق الامتداد .{ext}", f"Content is {sig[4]} but the extension claims .{ext}")
    elif not sig and ext and declared_kind not in ("code", "document", "data", "unknown"):
        add_reason("noSig", 25, f"لم يُعرف أي توقيع سحري معروف لامتداد .{ext}", f"No known magic signature for the .{ext} extension")

    if sig and sig_kind != "executable":
        for risky in RISKY_SIGS:
            rs = SIG_BY_EXT.get(risky)
            if not rs:
                continue
            if sig and rs[0] == sig[0]:
                continue
            try:
                if rs[5](head):
                    add_reason("polyglot", 35, f"يحتوي بايتات {rs[3]} داخل أول 8KB (قد يكون حمولة مدفونة — تحقق قبل التشغيل)", f"Contains {rs[4]} bytes within the first 8KB (possible appended payload)")
                    break
            except Exception:
                pass

    is_markup = bool(sig) and sig[0] in ("svg", "html", "xml")
    if is_markup and MARKUP_SCRIPT_RE.search(raw_text):
        add_reason("markupScript", 60, "ملف SVG/HTML يحتوي كوداً قابلاً للتنفيذ", "SVG/HTML file embeds executable code")

    head_is_container = bool(sig) and sig[0] in ("zip", "docx", "xlsx", "pptx", "apk")
    if head_is_container or (sig and sig[0] == "zip"):
        if ARCHIVE_EXEC_RE.search(raw_text):
            add_reason("archiveExec", 45, "الأرشيف يحتوي ملفات تنفيذية أو سكربتات", "Archive contains executables or scripts")

    if declared_kind in ("code", "document", "data") and 0 in head and not (sig and sig[0] in BINARY_CONTAINERS):
        add_reason("textBinary", 30, "ملف نصي يحتوي بايتات ثنائية (NUL)", "Text file contains binary NUL bytes")

    honest_executable = bool(sig and sig[1] == "executable" and ext and sig[0] == ext)
    if ent > 7.6 and not honest_executable and (ext in DANGEROUS_EXTS or ext in SCRIPT_EXTS):
        add_reason("packed", 35, f"محتوى معبّأ/مشفّر (إنتروبيا {ent}) — شائع في البرمجيات الخبيثة", f"Packed/encrypted content (entropy {ent}) — common in malware")
    elif ent > 7.9:
        add_reason("packedLow", 12, f"إنتروبيا عالية جداً ({ent})", f"Very high entropy ({ent})")

    if size > 500 * 1024 * 1024:
        add_reason("huge", 15, "ملف أكبر من 500MB", "File larger than 500MB")

# ── الإثراءات الذكية من حقائق C++ ───────────────────────────────────────

def enrich_from_facts(facts, sig):
    if not facts:
        return
    sig_kind = sig[1] if sig else None

    eoi = facts.get("eoi") or {}
    if sig_kind == "image" and eoi.get("valid", True) and "kind" in eoi:
        trailing = int(eoi.get("trailing") or 0)
        if trailing >= 32 and "appended" not in reason_ids():
            add_reason(
                "appended", 25,
                f"ثمة {trailing} بايت مضافة بعد نهاية الصورة — قد تكون حمولة مخفية",
                f"{trailing} bytes appended after the image end — possible hidden payload",
            )

    if "polyglot" not in reason_ids():
        offs = [o for o in (facts.get("execOffsets") or []) if o.get("at", 0) > 0][:3]
        if offs:
            ar = "بايتات تنفيذية " + " و".join(f"{o.get('ext')} عند إزاحة {o.get('at')}" for o in offs) + " داخل الملف"
            en = "Executable bytes " + " and ".join(f"{o.get('ext')} at offset {o.get('at')}" for o in offs) + " inside the file"
            add_reason("polyglotOffset", 35, ar, en)

    if "archiveExec" not in reason_ids():
        names = facts.get("zipNames") or []
        if any(ZIP_EXEC_RE.search(n) for n in names):
            add_reason("archiveExec", 45, "الأرشيف يحتوي ملفات تنفيذية أو سكربتات", "Archive contains executables or scripts")

    if "macro" not in reason_ids():
        markers = facts.get("markers") or []
        has_vba = any(m.get("id") == "vbaProject" for m in markers)
        if has_vba and sig_kind in ("archive", "document"):
            add_reason(
                "macroEmbedded", 55,
                "الحاوية تحوي ماكرو VBA مدفوناً (vbaProject) — قد ينفّذ كوداً",
                "Container embeds a VBA macro (vbaProject) — may run code",
            )

    if "packed" not in reason_ids():
        block_max = float(facts.get("blockEntropyMax") or 0.0)
        if block_max >= 7.9:
            add_reason(
                "packedBlock", 20,
                f"كتلة عالية الإنتروبيا ({block_max}) داخل الملف — محتوى معبّأ/مشفّر جزئياً",
                f"High-entropy block ({block_max}) inside the file — partially packed/encrypted content",
            )

# ── التقرير النهائي ─────────────────────────────────────────────────────

def build_report(b, name, size, facts):
    global REASONS
    REASONS = []
    name = safe_name(name)
    size = max(0, int(size or 0))
    head = b[:SCAN_HEAD_BYTES]
    list_ = exts_of(name)
    ext = list_[-1] if list_ else ""
    head_text = decode_utf8(head, 1024)
    raw_text = latin1(head, 2048)

    sig = detect_sig(head)
    info = EXT_INFO.get(ext)
    declared_kind = info[0] if info else (ext_kind(ext) or "unknown")
    declared_label = info[1] if info else None
    declared_lang = declared_label if declared_kind == "code" else None

    shebang = detect_shebang(head_text)
    language = declared_lang or shebang or None

    ent = entropy(head)
    if size == 0:
        add_reason("empty", 40, "الملف فارغ تماماً", "File is empty")
    if EICAR_RE.search(raw_text):
        add_reason("eicar", 100, "يحتوي سلسلة اختبار EICAR (Program Files EICAR)", "Contains the EICAR antivirus test string")

    base_rules(name, size, b, sig, declared_kind, declared_label, ext, head_text, raw_text, head)
    enrich_from_facts(facts, sig)

    score = min(100, sum(r["weight"] for r in REASONS))
    verdict = "danger" if score >= 70 else ("caution" if score >= 30 else "safe")
    blocked = verdict == "danger"

    if sig:
        detected = {"kind": sig[1], "ext": sig[0], "mime": sig[2], "label": {"ar": sig[3], "en": sig[4]}, "by": "magic"}
    else:
        detected = {
            "kind": declared_kind,
            "ext": ext or None,
            "mime": None,
            "label": {"ar": declared_label, "en": declared_label} if declared_label else None,
            "by": "extension" if ext else "none",
        }

    if sig and ext:
        agreement = "match" if sig[0] == ext else ("family" if kind_match(sig, declared_kind) else "mismatch")
    elif sig:
        agreement = "magic-only"
    else:
        agreement = "extension-only"

    report = {
        "name": name,
        "size": size,
        "ext": ext,
        "exts": list_,
        "verdict": verdict,
        "score": score,
        "blocked": blocked,
        "language": language,
        "detected": detected,
        "declared": {"kind": declared_kind, "label": declared_label, "language": declared_lang},
        "agreement": agreement,
        "entropy": ent,
        "reasons": REASONS,
        "texts": VERDICT_TEXT[verdict],
        "disclaimer": DISCLAIMER,
        "engine": "python+cpp" if facts else "python",
    }
    if shebang:
        report["shebang"] = shebang
    return report

def kind_match(sig, declared_kind):
    sig_kind = sig[1]
    return (sig_kind == declared_kind or
            (sig_kind == "video" and declared_kind == "video") or
            (sig_kind == "archive" and declared_kind in ("archive", "document", "data", "executable")) or
            (sig_kind == "code" and declared_kind in ("code", "document", "data")) or
            (sig_kind == "system" and declared_kind in ("archive", "data", "document")))

# ── الدخول ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing head path"}, ensure_ascii=False))
        return 2
    head_path = sys.argv[1]
    facts_path = sys.argv[2] if len(sys.argv) >= 3 else ""
    try:
        req = json.loads(sys.stdin.read() or "{}")
    except Exception:
        req = {}
    try:
        with open(head_path, "rb") as f:
            b = f.read()
    except OSError:
        print(json.dumps({"error": "cannot read head"}, ensure_ascii=False))
        return 2
    facts = {}
    if facts_path and os.path.exists(facts_path):
        try:
            with open(facts_path, "r", encoding="utf-8") as f:
                facts = json.load(f)
            if not isinstance(facts, dict):
                facts = {}
        except Exception:
            facts = {}
    name = req.get("name") or "file"
    size = req.get("size") or len(b)
    report = build_report(b, name, size, facts)
    print(json.dumps(report, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    sys.exit(main())