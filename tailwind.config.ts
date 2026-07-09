import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14181C",
          900: "#0F1317",
          800: "#161B20",
          700: "#1D242B",
          600: "#273038",
          500: "#37424C",
        },
        paper: {
          DEFAULT: "#EDE6D6",
          dim: "#C7BFAE",
          faint: "#8A8577",
        },
        rust: {
          DEFAULT: "#C1440E",
          soft: "#D9622C",
          dim: "#7A3313",
        },
        sage: {
          DEFAULT: "#6B8F71",
          soft: "#87AB8D",
          dim: "#3E5744",
        },
        gold: {
          DEFAULT: "#C9A227",
          soft: "#E0BE4A",
          dim: "#7C651A",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Source Serif Pro", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(201,162,39,0.35)" },
          "70%": { boxShadow: "0 0 0 10px rgba(201,162,39,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(201,162,39,0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "pulse-ring": "pulse-ring 1.8s infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
