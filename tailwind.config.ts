import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1F1F22",
        paper: "#F6F7F9",
        line: "#E2E8F0",
        warm: "#F9DCE5",
        sage: "#D47A95",
        signal: "#DF7D99",
        mogcia: {
          primary: "#D47A95",
          light: "#F9DCE5",
          dark: "#9B4862",
          bg: "#F6F7F9",
          surface: "#FFFFFF",
          face: "#111827",
          eye: "#DF7D99",
          blush: "#475569",
          icon: "#FDF0F4"
        }
      },
      boxShadow: {
        soft: "0 18px 60px rgba(31, 31, 34, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
