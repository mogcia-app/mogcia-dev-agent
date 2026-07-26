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
        paper: "#F8F4F3",
        line: "#E9DAD8",
        warm: "#D5B5B2",
        sage: "#C79A98",
        signal: "#F3B8C0",
        mogcia: {
          primary: "#D5B5B2",
          light: "#E9CBC8",
          dark: "#C79A98",
          bg: "#F8F4F3",
          surface: "#F7F3F2",
          face: "#1F1F22",
          eye: "#F3B8C0",
          blush: "#B97B80",
          icon: "#F8F2F2"
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
