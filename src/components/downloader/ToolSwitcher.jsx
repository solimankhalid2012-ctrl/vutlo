import React from "react";
import { motion } from "framer-motion";
import { useLang } from "../../context/LangContext.jsx";
import { TOOLS, toolById } from "../../utils/tools.js";

/**
 * ToolSwitcher — يختار المستخدم الأداة قبل التحميل: فيديو / صوت / GIF / ضغط / قائمة / جدولة.
 * هذه هي النقطة التي تجعل كل الميزات مرئية بدل دفنها في تبويبات.
 */
export default function ToolSwitcher({ value, onChange, className = "" }) {
  const { lang } = useLang();
  const ar = lang === "ar";

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" aria-label={ar ? "أدوات التحميل" : "Download tools"}>
      {TOOLS.map((tool) => {
        const active = tool.id === value;
        return (
          <motion.button
            key={tool.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tool.id)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            title={tool.hint[ar ? "ar" : "en"]}
            className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-black transition-all ${
              active
                ? "bg-gradient-to-r from-emerald to-emerald-dark text-on-accent shadow-[0_6px_24px_rgba(29,185,84,0.35)]"
                : "border border-white/10 bg-white/5 text-white/70 hover:border-emerald/40 hover:text-white"
            }`}
          >
            <span className="text-lg">{tool.icon}</span>
            {tool.label[ar ? "ar" : "en"]}
          </motion.button>
        );
      })}
      <span className="sr-only">{toolById(value).hint.en}</span>
    </div>
  );
}
