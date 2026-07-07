import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14110f",
        paper: "#f7f5f0",
        line: "#d8d2c5",
        mall: "#256f6d",
        shift: "#8b4e25",
        approve: "#1f7a4d",
        warn: "#b54708"
      },
      boxShadow: {
        panel: "0 1px 0 rgba(20, 17, 15, 0.08), 0 12px 32px rgba(20, 17, 15, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
