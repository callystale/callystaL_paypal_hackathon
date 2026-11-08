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
          base: "#ede7da", page: "#fffcf5", inset: "#e5dfd2", hover: "#d8d4c6", line: "#b6b09f",
        },
        ink: { DEFAULT: "#24271f", soft: "#3e4539", muted: "#53594b" },
        brand: {
          50: "#f0f3e9", 100: "#e2e9d7", 200: "#c9d6ba", 300: "#4f674e",
          400: "#486046", 500: "#435a41", 600: "#3d563a", 700: "#394c37", 800: "#31432f", 900: "#263524",
        },
        rose: { 300: "#8a414b", 400: "#923f4b", 500: "#ae5b65", 600: "#9b4652", 700: "#813b45" },
        amber: { 300: "#805e20", 400: "#805b18", 500: "#a57829", 600: "#8b6322", 700: "#6f501a" },
        emerald: { 300: "#3e6652", 400: "#34634d", 500: "#548269", 600: "#3d6c53", 700: "#305440" },
        sky: { 300: "#3f6478", 400: "#375e72", 500: "#5d8395", 600: "#446b80", 700: "#355469" },
        indigo: { 300: "#5f5982", 400: "#5f5982", 500: "#756c97", 600: "#61577e" },
        violet: { 300: "#735b85", 400: "#735b85", 500: "#9177a4" },
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
