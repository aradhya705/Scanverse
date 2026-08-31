/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#0A0714",
        paper: "#F3EEFA",
        "paper-dim": "#E9DFF5",
        surface: {
          light: "#FFFFFF",
          dark: "#0D0818",
        },
        brand: {
          DEFAULT: "#9D4EDD",
          soft: "#C77DFF",
          deep: "#6A0DAD",
        },
        laser: "#C77DFF",
        flag: "#FFA53D",
        line: {
          light: "#E1D2F2",
          dark: "#241934",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      boxShadow: {
        soft: "0 8px 30px -12px rgba(16, 21, 27, 0.18)",
        card: "0 2px 10px -2px rgba(16, 21, 27, 0.08)",
        glow: "0 0 0 1px rgba(0, 209, 178, 0.35), 0 0 24px -4px rgba(0, 209, 178, 0.45)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "translateY(-4%)", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { transform: "translateY(104%)", opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        sweep: "sweep 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
