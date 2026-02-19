import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "sans-serif"],
      },
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#1a1a1a",
          foreground: "#fafafa",
        },
        border: "#2a2a2a",
        input: "#2a2a2a",
        ring: "#3a3a3a",
        primary: {
          DEFAULT: "#fafafa",
          foreground: "#0a0a0a",
        },
        secondary: {
          DEFAULT: "#1a1a1a",
          foreground: "#fafafa",
        },
        muted: {
          DEFAULT: "#1a1a1a",
          foreground: "#888888",
        },
        accent: {
          DEFAULT: "#1a1a1a",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#ff4444",
          foreground: "#fafafa",
        },
      },
      borderRadius: {
        lg: "4px",
        md: "4px",
        sm: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
