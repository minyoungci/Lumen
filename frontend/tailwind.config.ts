import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     "#f5f5f7",   // Apple site background
          surface:  "#ffffff",   // Card background
          elevated: "#fbfbfd",   // Slightly elevated surface
          overlay:  "#e8e8ed",   // Overlay / dividers
        },
        glass: {
          DEFAULT: "rgba(255,255,255,0.72)",
          hover:   "rgba(255,255,255,0.88)",
          border:  "rgba(0,0,0,0.08)",
          tint:    "rgba(0,113,227,0.06)",
          // Liquid Glass materials
          ultra:   "rgba(255,255,255,0.92)",
          thin:    "rgba(255,255,255,0.55)",
          chrome:  "rgba(255,255,255,0.95)",
          edge:    "rgba(255,255,255,0.85)",
        },
        primary: {
          400: "#4da6ff",
          500: "#0071e3",   // Apple blue
          600: "#0059b8",
        },
        secondary: {
          400: "#a78bfa",
          500: "#8b5cf6",
        },
        text: {
          primary:   "#1d1d1f",  // Apple dark text
          secondary: "#6e6e73",  // Apple secondary text
          muted:     "#a1a1a6",  // Apple muted text
        },
      },
      backdropBlur: {
        xs:    "2px",
        glass: "20px",
        heavy: "40px",
      },
      backdropSaturate: {
        glass: "180%",
        ultra: "200%",
      },
    },
  },
  plugins: [],
};

export default config;
