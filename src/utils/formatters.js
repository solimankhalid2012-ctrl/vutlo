// formatters — تنسيق المدد والأحجام
export const fmtBytes = (b = 0) => {
  const n = Math.max(0, Number(b) || 0);
  // تحت 10 KB نعرض عشرية، وإلا ظهرت الملفات الصغيرة "0 KB"
  if (!n) return "0 KB";
  const kb = n / 1e3;
  if (kb >= 1e6) return `${(kb / 1e6).toFixed(1)} GB`;
  if (kb >= 1e3) return `${(kb / 1e3).toFixed(1)} MB`;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
};

export const fmtTime = (s = 0) => {
  const total = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const x = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
};
