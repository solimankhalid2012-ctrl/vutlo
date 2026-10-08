// downloader.js — منطق التحميل المتوازي + الاستئناف (واجهة أمامية)
export function buildDownloadPayload(url,{quality,format}){return {url:url.trim(),quality,format};}
export function downloadBlobUrl(fileUrl,filename='vutlo.mp4'){const a=document.createElement('a');a.href=fileUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();}
