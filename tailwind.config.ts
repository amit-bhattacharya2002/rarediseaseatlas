import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "#FAF9F6",
        ink: "#1B1B1A",
        mute: "#6B6A66",
        line: "#E6E4DE",
        sand: {
          50: "#F3EFE6",
          100: "#E4DDCF",
          200: "#C9BFA8",
          300: "#A89A7A",
        },
        indigo: {
          signal: {
            100: "#D9DCE8",
            200: "#A8B0C9",
            300: "#6B7799",
            400: "#3D4A6B",
            500: "#1E2A4A",
            600: "#121A30",
          },
        },
      },
      fontFamily: {
        serif: ["var(--font-literata)", "Literata", "Georgia", "serif"],
        sans: ["var(--font-figtree)", "Figtree", "Helvetica Neue", "sans-serif"],
        montserrat: ["var(--font-montserrat)", "Montserrat", "Helvetica Neue", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-sm": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "title": ["1.75rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "lede": ["1.25rem", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [],
};

export default config;
