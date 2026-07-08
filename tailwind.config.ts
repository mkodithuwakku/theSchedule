import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        mall: "rgb(var(--color-mall) / <alpha-value>)",
        shift: "rgb(var(--color-shift) / <alpha-value>)",
        approve: "rgb(var(--color-approve) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)"
      }
    }
  },
  plugins: []
};

export default config;
