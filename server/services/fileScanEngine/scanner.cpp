// ══════════════════════════════════════════════════════════════════════════
// fileScanEngine/scanner.cpp — عمق C++ لمحرك فحص الملفات (مستوى البايت)
//
// يقرأ رأس الملف من القرص ويطبع JSON بالحقائق الخام على stdout:
//   entropy + blockEntropyMax/At     انتروبيا شانون (كلية + لكل كتلة 4KB)
//   nulRatio / ctrlRatio / printable / longestNulRun / textScore
//   markers[]                        علامات نصية خطرة (بالإزاحة)
//   zipNames[]                       أسماء داخل أرشيفات ZIP بلا فك ضغط
//   execOffsets[]                    توقيعات تنفيذية على إزاحات > 0
//   pe / elf                         بنية ترويسات التنفيذيات (إن وُجدت)
//   eoi{"kind","at","trailing"}      موضع نهاية الصورة + بايتات مضافة بعدها
//
// الاستعمال: scanner.exe <inputPath> [maxBytes]
// مخرجات ASCII JSON فقط — بلا أي نص آخر على stdout.
// ══════════════════════════════════════════════════════════════════════════

#include <cstdint>
#include <cstdio>
#include <cmath>
#include <cstring>
#include <string>
#include <vector>
#include <fstream>
#include <algorithm>

using Bytes = std::vector<unsigned char>;

static double round3(double x) { return std::round(x * 1000.0) / 1000.0; }

static std::string fmt3(double v) {
  char buf[40];
  std::snprintf(buf, sizeof(buf), "%.3f", v);
  return buf;
}

static std::string fmt4(double v) {
  char buf[40];
  std::snprintf(buf, sizeof(buf), "%.4f", v);
  return buf;
}

static std::string jsonStr(const std::string& v) {
  std::string o = "\"";
  for (unsigned char c : v) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", (unsigned)c);
          o += buf;
        } else {
          o += (char)c;
        }
    }
  }
  o += "\"";
  return o;
}

static double shannon(const Bytes& b) {
  if (b.empty()) return 0.0;
  uint64_t counts[256] = {0};
  for (unsigned char c : b) counts[(size_t)c]++;
  double h = 0.0;
  const double n = (double)b.size();
  for (int i = 0; i < 256; i++) {
    if (!counts[i]) continue;
    const double p = (double)counts[i] / n;
    h -= p * std::log2(p);
  }
  return round3(h);
}

struct Marker {
  const char* id;
  const char* needle;
};

static const Marker MARKERS[] = {
  { "phpOpen", "<?php" },
  { "jspTag", "<%" },
  { "aspTag", "<%=" },
  { "powershell", "powershell" },
  { "cmdExe", "cmd.exe" },
  { "binSh", "/bin/sh" },
  { "binBash", "/bin/bash" },
  { "chmod", "chmod" },
  { "curl", "curl " },
  { "wget", "wget " },
  { "devTcp", "/dev/tcp" },
  { "scriptTag", "<script" },
  { "javascript", "javascript:" },
  { "vbscript", "vbscript:" },
  { "onload", "onload=" },
  { "onerror", "onerror=" },
  { "evalCall", "eval(" },
  { "base64", "base64" },
  { "systemCall", "system(" },
  { "execCall", "exec(" },
  { "osSystem", "os.system" },
  { "subprocess", "subprocess" },
  { "wscriptShell", "wscript.shell" },
  { "shellCall", ".shell(" },
  { "vbaProject", "vbaproject" },
  { "macro", "macro" },
  { "mshta", "mshta" },
  { "loveletter", "iwshshell" },
  { "regAdd", "reg add" },
  { "startProcess", "start-process" },
  { "batchParam", "%~" },
  { "echoOff", "@echo" },
  { "iframe", "<iframe" },
  { "objectTag", "<object" },
  { "embeddedFile", "embeddedfile" },
  { "serverExec", "include(" },
};

static bool startsWith(const Bytes& b, size_t off, const unsigned char* sig, size_t len) {
  if (off + len > b.size()) return false;
  for (size_t i = 0; i < len; i++) if (b[off + i] != sig[i]) return false;
  return true;
}

static void writeFacts(const Bytes& b) {
  std::vector<std::string> parts;

  // ── أرقام أساسية ──
  parts.push_back("\"engine\": \"cpp\"");
  parts.push_back("\"sampleLen\": " + std::to_string(b.size()));

  size_t nul = 0, ctrl = 0, printable = 0, textish = 0, longestNulRun = 0, curNul = 0;
  for (size_t i = 0; i < b.size(); i++) {
    const unsigned char c = b[i];
    if (c == 0) { nul++; curNul++; if (curNul > longestNulRun) longestNulRun = curNul; }
    else curNul = 0;
    if (c < 0x20 && c != 9 && c != 10 && c != 13) ctrl++;
    if (c >= 0x20 && c <= 0x7e) printable++;
    if ((c >= 0x20 && c <= 0x7e) || c == 9 || c == 10 || c == 13) textish++;
  }
  const double total = b.empty() ? 1.0 : (double)b.size();
  parts.push_back("\"entropy\": " + fmt3(shannon(b)));
  parts.push_back("\"nulRatio\": " + fmt4((double)nul / total));
  parts.push_back("\"ctrlRatio\": " + fmt4((double)ctrl / total));
  parts.push_back("\"printableRatio\": " + fmt4((double)printable / total));
  parts.push_back("\"textScore\": " + fmt4((double)textish / total));
  parts.push_back("\"longestNulRun\": " + std::to_string(longestNulRun));

  // ── أقصى انتروبيا لكل كتلة 4KB ──
  double maxBlock = 0.0; size_t maxAt = 0;
  for (size_t off = 0; off + 1 <= b.size(); off += 4096) {
    const size_t end = std::min(off + 4096, b.size());
    Bytes block(b.begin() + off, b.begin() + end);
    const double h = shannon(block);
    if (off > 0 && h > maxBlock) { maxBlock = h; maxAt = off; }
  }
  parts.push_back("\"blockEntropyMax\": " + fmt3(maxBlock));
  parts.push_back("\"blockEntropyAt\": " + std::to_string(maxAt));

  // ── توقيعات تنفيذية عبر إزاحات الرأس (إزاحات > 0) ──
  {
    std::vector<std::string> items;
    const struct { const unsigned char* sig; size_t len; const char* ext; bool mz; } sigs[] = {
      { (const unsigned char*)"\x4d\x5a", 2, "exe", true },
      { (const unsigned char*)"\x7f\x45\x4c\x46", 4, "elf", false },
      { (const unsigned char*)"dex\n", 4, "dex", false },
      { (const unsigned char*)"\x00\x61\x73\x6d", 4, "wasm", false },
      { (const unsigned char*)"\xca\xfe\xba\xbe", 4, "class", false },
      { (const unsigned char*)"\xcf\xfa\xed\xfe", 4, "macho", false },
    };
    const size_t scanEnd = std::min((size_t)8192, b.size());
    for (const auto& s : sigs) {
      for (size_t off = 1; off + s.len <= scanEnd; off++) {
        if (startsWith(b, off, s.sig, s.len)) {
          if (s.mz && (off < 64 || b.size() - off < 4096)) break;
          if (s.ext == std::string("class") && (off + 8 > b.size() || b[off + 7] != 0)) continue;
          items.push_back("{\"ext\": " + jsonStr(s.ext) + ", \"at\": " + std::to_string((long long)off) + "}");
          break;
        }
      }
    }
    std::string j = "\"execOffsets\": [";
    for (size_t i = 0; i < items.size(); i++) { if (i) j += ", "; j += items[i]; }
    j += "]";
    parts.push_back(j);
  }

  // ── علامات نصية خطرة ──
  {
    Bytes lower = b;
    for (unsigned char& c : lower) c = (unsigned char)std::tolower((int)c);
    std::vector<std::string> items;
    for (const Marker& m : MARKERS) {
      if (items.size() >= 40) break;
      const size_t needle = std::strlen(m.needle);
      if (needle == 0) continue;
      bool found = false;
      for (size_t i = 0; i + needle <= lower.size(); i++) {
        if (startsWith(lower, i, (const unsigned char*)m.needle, needle)) {
          items.push_back("{\"id\": " + jsonStr(m.id) + ", \"at\": " + std::to_string((long long)i) + "}");
          found = true;
          break;
        }
      }
      if (!found) continue;
    }
    std::string j = "\"markers\": [";
    for (size_t i = 0; i < items.size(); i++) { if (i) j += ", "; j += items[i]; }
    j += "]";
    parts.push_back(j);
  }

  // ── أسماء داخل ZIP (رؤوس local file فقط) ──
  {
    std::vector<std::string> items;
    size_t pos = 0;
    size_t iterations = 0;
    while (pos + 4 <= b.size() && items.size() < 40 && iterations++ < (size_t)b.size()) {
      if (b[pos] == 0x50 && b[pos + 1] == 0x4b && b[pos + 2] == 0x03 && b[pos + 3] == 0x04) {
        if (pos + 30 <= b.size()) {
          const size_t nameLen = (size_t)b[pos + 26] | ((size_t)b[pos + 27] << 8);
          const size_t extraLen = (size_t)b[pos + 28] | ((size_t)b[pos + 29] << 8);
          if (pos + 30 + nameLen <= b.size()) {
            std::string name;
            for (size_t i = 0; i < nameLen && i < 120; i++) {
              const unsigned char c = b[pos + 30 + i];
              name += (c >= 0x20 && c <= 0x7e) ? (char)c : '.';
            }
            if (!name.empty()) items.push_back(jsonStr(name));
            pos += 30 + nameLen + extraLen;
            continue;
          }
        }
      }
      pos++;
    }
    std::string j = "\"zipNames\": [";
    for (size_t i = 0; i < items.size(); i++) { if (i) j += ", "; j += items[i]; }
    j += "]";
    parts.push_back(j);
  }

  // ── PE ──
  {
    std::string j = "\"pe\": {";
    if (b.size() >= 64 && b[0] == 'M' && b[1] == 'Z') {
      const uint32_t e_lfanew = (uint32_t)b[0x3c] | ((uint32_t)b[0x3d] << 8) |
                                ((uint32_t)b[0x3e] << 16) | ((uint32_t)b[0x3f] << 24);
      if (e_lfanew + 96 <= b.size() && b[e_lfanew] == 'P' && b[e_lfanew + 1] == 'E' &&
          b[e_lfanew + 2] == 0 && b[e_lfanew + 3] == 0) {
        const uint16_t machine = (uint16_t)b[e_lfanew + 4] | ((uint16_t)b[e_lfanew + 5] << 8);
        const uint16_t sections = (uint16_t)b[e_lfanew + 6] | ((uint16_t)b[e_lfanew + 7] << 8);
        const uint16_t optMagic = (uint16_t)b[e_lfanew + 24] | ((uint16_t)b[e_lfanew + 25] << 8);
        uint16_t subsystem = 0;
        if ((optMagic == 0x10b || optMagic == 0x20b) && e_lfanew + 24 + 68 + 2 <= b.size()) {
          subsystem = (uint16_t)b[e_lfanew + 24 + 68] | ((uint16_t)b[e_lfanew + 24 + 68 + 1] << 8);
        }
        j += "\"valid\": true, \"machine\": " + std::to_string(machine) +
             ", \"subsystem\": " + std::to_string(subsystem) +
             ", \"sections\": " + std::to_string(sections);
      } else {
        j += "\"valid\": false";
      }
    } else {
      j += "\"valid\": false";
    }
    j += "}";
    parts.push_back(j);
  }

  // ── ELF ──
  {
    std::string j = "\"elf\": {";
    if (b.size() >= 20 && b[0] == 0x7f && b[1] == 'E' && b[2] == 'L' && b[3] == 'F') {
      const uint8_t cls = b[4];
      const uint16_t type = (uint16_t)b[16] | ((uint16_t)b[17] << 8);
      const uint16_t machine = (uint16_t)b[18] | ((uint16_t)b[19] << 8);
      j += "\"valid\": true, \"class\": " + std::to_string(cls) +
           ", \"type\": " + std::to_string(type) +
           ", \"machine\": " + std::to_string(machine);
    } else {
      j += "\"valid\": false";
    }
    j += "}";
    parts.push_back(j);
  }

  // ── نهاية الصورة (EOI) + البايتات المضافة بعدها ──
  {
    std::string j = "\"eoi\": {";
    bool eoi = false;
    if (startsWith(b, 0, (const unsigned char*)"\xff\xd8\xff", 3)) {
      for (size_t i = 0; i + 2 <= b.size() && i < 200000; i++) {
        if (b[i] == 0xff && b[i + 1] == 0xd9) {
          j += "\"valid\": true, \"kind\": \"jpeg\", \"at\": " + std::to_string((long long)i) +
               ", \"trailing\": " + std::to_string((long long)(b.size() - (i + 2)));
          eoi = true;
          break;
        }
      }
    } else if (startsWith(b, 0, (const unsigned char*)"\x89PNG\r\n\x1a\n", 8)) {
      static const unsigned char IEND[] = { 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82 };
      for (size_t i = 0; i + 12 <= b.size() && i < 400000; i++) {
        if (startsWith(b, i, IEND, sizeof(IEND))) {
          j += "\"valid\": true, \"kind\": \"png\", \"at\": " + std::to_string((long long)i) +
               ", \"trailing\": " + std::to_string((long long)(b.size() - (i + 12)));
          eoi = true;
          break;
        }
      }
    } else if (startsWith(b, 0, (const unsigned char*)"GIF87a", 6) || startsWith(b, 0, (const unsigned char*)"GIF89a", 6)) {
      long long last = -1;
      for (size_t i = 0; i < b.size(); i++) if (b[i] == 0x3b) last = (long long)i;
      if (last >= 0) {
        j += "\"valid\": true, \"kind\": \"gif\", \"at\": " + std::to_string(last) +
             ", \"trailing\": " + std::to_string((long long)(b.size() - (size_t)(last + 1)));
        eoi = true;
      }
    }
    if (!eoi) j += "\"valid\": false";
    j += "}";
    parts.push_back(j);
  }

  // ── تجميع الـJSON ──
  std::string out = "{";
  for (size_t i = 0; i < parts.size(); i++) {
    if (i) out += ", ";
    out += parts[i];
  }
  out += "}\n";
  std::fwrite(out.data(), 1, out.size(), stdout);
  std::fflush(stdout);
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: scanner <inputPath> [maxBytes]\n");
    return 2;
  }
  long long maxBytes = 262144;
  if (argc >= 3) maxBytes = std::atoll(argv[2]);
  if (maxBytes < 16) maxBytes = 16;
  if (maxBytes > 262144) maxBytes = 262144;

  Bytes data;
  {
    std::ifstream in(argv[1], std::ios::binary);
    if (!in) {
      std::fprintf(stderr, "cannot open file\n");
      return 2;
    }
    data.reserve((size_t)maxBytes);
    unsigned char chunk[65536];
    while (data.size() < (size_t)maxBytes && !in.eof()) {
      const size_t want = (size_t)std::min<long long>((long long)sizeof(chunk), maxBytes - (long long)data.size());
      in.read((char*)chunk, (std::streamsize)want);
      const std::streamsize got = in.gcount();
      if (got <= 0) break;
      data.insert(data.end(), chunk, chunk + (size_t)got);
    }
  }

  writeFacts(data);
  return 0;
}