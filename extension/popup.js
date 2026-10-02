// VideoVault Pro — popup: prefill current tab URL, open site with ?url=
const BASES = ["https://videovaultpro.com/download", "http://localhost:5173/download"];

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const input = document.getElementById("url");
  if (tab?.url?.startsWith("http")) input.value = tab.url;
  document.getElementById("hint").textContent = tab?.url || "";
  document.getElementById("go").onclick = async () => {
    const { vvBase = BASES[0] } = await chrome.storage.sync.get("vvBase");
    const u = encodeURIComponent(input.value.trim() || tab?.url || "");
    chrome.tabs.create({ url: `${vvBase}?url=${u}` });
  };
}
init();
