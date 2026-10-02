# 🧩 VideoVault Pro — Browser Extension (Manifest V3)

- يعمل على **Chrome / Edge / Firefox** (MV3).
- الزر يقرأ رابط التبويب الحالي ويفتح `/download?url=…` (صفحة Download تلتقط `?url=` وتعبّئ الحقل تلقائياً).
- كليك يمين على أي رابط/فيديو → **Download with VideoVault Pro**.
- للنشر: `chrome://extensions` → وضع المطور → Load unpacked → مجلد `extension/`.
- الأيقونات: موجودة في `icons/icon-16|48|128.png` (مولّدة من تصميم `public/favicon.svg`). الـmanifest بلا `default_locale` لأنه لا يوجد `_locales/`.
- الإعداد: `vvBase` في `chrome.storage.sync` يبدّل بين الإنتاج والمحلي.
