// Vutlo — background (MV3 service worker): right-click → download
const MENU_ID = "vv-download";

const buildMenu = () => {
  // ⚠️ onInstalled يُستدعى في كل تحديث، وcreate بمعرّف موجود ⇒ خطأ
  // "Cannot create item with duplicate id" في كل تحديث، والقائمة القديمة
  // بنصّ قديم تبقى. removeAll أولاً يضمن حالة واحدة صحيحة.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "⬇ Download with Vutlo",
      contexts: ["link", "video", "page"],
    });
  });
};

// onStartup يغطّي تفعيل الـ service worker بعد إغلاق المتصفح
chrome.runtime.onInstalled.addListener(buildMenu);
chrome.runtime.onStartup.addListener(buildMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const { vvBase = "https://vutlo.com/download" } = await chrome.storage.sync.get("vvBase");
  const u = encodeURIComponent(info.linkUrl || info.srcUrl || tab?.url || "");
  chrome.tabs.create({ url: `${vvBase}?url=${u}` });
});
