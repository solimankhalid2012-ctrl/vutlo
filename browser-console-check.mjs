/**
 * فحص المتصفح الحقيقي: يفتح Chromium/Edge بلا إضافات (clean profile) عبر
 * DevTools Protocol، يزور المسارات المطلوبة، ويطبع أي console error/warning
 * مع مصدره الحقيقي (file:line:col) وstack أول إطار.
 *
 * لماذا؟ أخطاء مثل "Uncaught (in promise) SyntaxError: Unexpected end of JSON input"
 * لا تُصدر stack مفيداً، وتبدو في DevTools وكأنها من الصفحة نفسها (features:1)
 * بينما قد تكون من حزمة قديمة أو من سكربت محقون خارجي. هذا الفحص يجيب
 * سؤال "من أين الخطأ فعلاً؟" تجريبياً بدل التخمين.
 *
 * الاستخدام:
 *   node browser-console-check.mjs                       # المسارات الافتراضية
 *   node browser-console-check.mjs /features /download    # مسارات محددة
 *   BROWSER="C:\path\msedge.exe" node browser-console-check.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.env.ORIGIN || "http://localhost:4001";
const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/features", "/download", "/history", "/login", "/register", "/blog", "/about", "/contact"];
const SETTLE_MS = Number(process.env.SETTLE_MS || 3500);

const CANDIDATES = [
  process.env.BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error("FAIL  لم يُعثر على Chrome/Edge. حدّد المتصفح عبر BROWSER=<path>");
  process.exit(2);
}

const profile = join(tmpdir(), `vv-console-${process.pid}`);
mkdirSync(profile, { recursive: true });

const child = spawn(
  exe,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions", // مصدرforeign محتمل للخطأ — نستبعده عمداً
    "--disable-background-networking",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => {
  try { child.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);

async function readDevToolsPort() {
  const file = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    try {
      const line = readFileSync(file, "utf8").split("\n")[0].trim();
      if (line) return Number(line);
    } catch {}
    await sleep(100);
  }
  throw new Error("تعذّر بدء المتصفح (لا DevToolsActivePort)");
}

/** عميل CDP مصغّر: send(msg) مع ترقيم، والمقابل events/close. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const handlers = [];
  let seq = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error(`WebSocket: ${e.message || "error"}`)));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} (${msg.method || ""})`)) : resolve(msg.result);
    } else if (msg.method) {
      handlers.forEach((h) => h(msg.method, msg.params));
    }
  });
  return {
    ready,
    on: (fn) => handlers.push(fn),
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
}

const port = await readDevToolsPort();
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("لا يوجد هدف صفحة في المتصفح");

const cdp = connect(page.webSocketDebuggerUrl);
await cdp.ready;

let bucket = [];
cdp.on((method, params) => {
  if (method === "Runtime.exceptionThrown") {
    const d = params.exceptionDetails;
    const frame = d.stackTrace?.callFrames?.[0];
    bucket.push({
      kind: "exception",
      text: d.exception?.description || d.text,
      where: d.url
        ? `${d.url}:${(d.lineNumber ?? 0) + 1}:${(d.columnNumber ?? 0) + 1}`
        : "(بلا مصدر — سكربت محقون أو سياق المستند)",
      frame: frame ? `${frame.url || "?"}:${(frame.lineNumber ?? 0) + 1}` : "",
      detail: d.exception?.description?.split("\n").slice(1, 3).join(" ") || "",
    });
  }
  if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "warning")) {
    const args = (params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
    bucket.push({
      kind: `console.${params.type}`,
      text: args,
      where: params.stackTrace?.callFrames?.[0]?.url || "(direct call to console)",
      frame: "",
      detail: "",
    });
  }
  if (method === "Log.entryAdded") {
    const e = params.entry;
    if (e.level === "error") {
      bucket.push({ kind: `log.${e.source}`, text: e.text, where: e.url || "", frame: "", detail: "" });
    }
  }
});

await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Page.enable");

let failed = 0;
const real = ROUTES.map((r) => (r.startsWith("http") ? r : ORIGIN + r));

for (const url of real) {
  bucket = [];
  await cdp.send("Page.navigate", { url });
  await sleep(SETTLE_MS);

  const errors = bucket.filter((b) => b.kind === "exception" || b.kind === "console.error" || b.kind.startsWith("log."));
  const warn = bucket.filter((b) => b.kind === "console.warning");
  const label = url.replace(ORIGIN, "") || "/";

  if (!errors.length) {
    console.log(`PASS  ${label}${warn.length ? `  (${warn.length} تحذير)` : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}  — ${errors.length} خطأ`);
    for (const e of errors) {
      console.log(`        [${e.kind}] ${e.text}`);
      if (e.where) console.log(`        source: ${e.where}`);
      if (e.frame) console.log(`        top frame: ${e.frame}`);
      if (e.detail) console.log(`        ${e.detail}`);
    }
  }
  for (const w of warn) console.log(`        [${w.kind}] ${w.text}`);
}

cdp.close();
console.log(failed ? `\n${failed} مسار فيه أخطاء.` : "\nلا أخطاء في أي مسار.");
process.exit(failed ? 1 : 0);