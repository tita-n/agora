import type { Config } from "tailwindcss";

/**
 * Design tokens — docs/DESIGN.md "Market Ledger" is the prose; this is the
 * machine. One palette for every surface (marketing, auth, dashboard,
 * developer, admin) so nothing keeps a private color scheme.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./themes/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#14261D", muted: "#4A5D52", faint: "#6B7A70" },
        paper: "#FAF7F2",
        card: "#FFFDF9",
        rule: { DEFAULT: "#E3DCCE", strong: "#CFC6B2" },
        brass: { DEFAULT: "#B4551D", dark: "#8F4216", faint: "#F6E8DE" },
        success: "#1D6B4F",
        danger: "#A32E20",
        warn: "#9A6700",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        // ONE elevation token; cards use borders, not shadows.
        lift: "0 1px 2px rgb(20 38 29 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
