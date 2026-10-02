/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 🎨 الهوية الرسمية — VideoVault Pro
        void: {
          DEFAULT: "#0A0E0A",
          50: "#0F1510",
          100: "#14201A",
          200: "#1B2B22",
          300: "#23382D",
          400: "#2D4A3A",
          500: "#3A5F4A",
          600: "#4A7560",
          700: "#14201A",
          800: "#0F1510",
          900: "#0A0E0A",
        },
        emerald: {
          DEFAULT: "#1DB954",
          dark: "#159A44",
          light: "#4ADE80",
        },
        mint: {
          DEFAULT: "#A8E6CF",
          light: "#D4F5E6",
          dark: "#7FD6B5",
        },
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
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(29,185,84,0.25), transparent), linear-gradient(180deg, #0A0E0A 0%, #0D1A12 50%, #0A0E0A 100%)",
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
