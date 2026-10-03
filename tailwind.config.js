/** @type {import('tailwindcss').Config} */

// 🎨 ألوان النظام كلها عبر متغيّرات CSS ⇒ الوضع النهاري يعمل بلا تكرار.
//    القيم في globals.css (:root) وthemes.css ([data-theme="light"]).
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ⚠️ white ليست "#fff" في النهاري: صارت "لون النص/السطح المرتفع"
        // ⇒ bg-white/5 و text-white/70 يتكيّفان مع الوضع بلا تعديل أي مكوّن.
        white: token("--c-ink"),
        // 🎨 الهوية الرسمية — VideoVault Pro
        void: {
          DEFAULT: token("--c-void"),
          50: token("--c-void-50"),
          100: token("--c-void-100"),
          200: token("--c-void-200"),
          300: token("--c-void-300"),
          400: token("--c-void-400"),
          500: token("--c-void-500"),
          600: token("--c-void-600"),
          700: token("--c-void-700"),
          800: token("--c-void-800"),
          900: token("--c-void-900"),
        },
        emerald: {
          DEFAULT: token("--c-emerald"),
          dark: token("--c-emerald-dark"),
          light: token("--c-emerald-light"),
        },
        mint: {
          DEFAULT: token("--c-mint"),
          light: token("--c-mint-light"),
          dark: token("--c-mint-dark"),
        },
        // نص فوق Emerald/Mint (أزرار): داكن في النهاري، أبيض في الليلي
        "on-accent": token("--c-on-accent"),
      },
      fontFamily: {
        // Cairo للعربية + Inter للإنجليزية
        cairo: ["Cairo", "Inter", "system-ui", "sans-serif"],
        inter: ["Inter", "Cairo", "system-ui", "sans-serif"],
      },
      opacity: {
        15: "0.15",
        35: "0.35",
        45: "0.45",
        55: "0.55",
        65: "0.65",
        85: "0.85",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(29,185,84,0.25), transparent), var(--page-bg)",
        "card-gradient":
          "linear-gradient(135deg, rgba(29,185,84,0.12) 0%, rgba(168,230,207,0.05) 100%)",
        "glow-green": "radial-gradient(circle, rgba(29,185,84,0.4) 0%, transparent 70%)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(29,185,84,0.35)",
        "glow-lg": "0 0 48px rgba(29,185,84,0.45)",
        card: "0 8px 32px rgba(0,0,0,0.45)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
