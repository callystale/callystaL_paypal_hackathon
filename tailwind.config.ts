import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          base: "#080e1c", page: "#101b2e", inset: "#16243a", hover: "#20324b", line: "#2c405c",
        },
        ink: { DEFAULT: "#edf4ff", soft: "#bdcee5", muted: "#8fa6c4" },
        brand: {
          50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9",
          400: "#22d3ee", 500: "#06b6d4", 600: "#0e7490", 700: "#155e75", 800: "#164e63", 900: "#123b50",
        },
        rose: { 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c" },
        amber: { 300: "#fde68a", 400: "#fcd34d", 500: "#f59e0b", 600: "#d97706", 700: "#b45309" },
        emerald: { 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857" },
        sky: { 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1" },
        indigo: { 300: "#a5b4fc", 400: "#a5b4fc", 500: "#6366f1", 600: "#4f46e5" },
        violet: { 300: "#c4b5fd", 400: "#c4b5fd", 500: "#8b5cf6" },
        paypal: {
          500: "#0070ba",
          600: "#003087",
          700: "#001c64",
        },
      },
    },
  },
  plugins: [],
};

export default config;
