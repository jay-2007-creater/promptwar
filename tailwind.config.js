/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
        display: ["Sora", "Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
        hairline: "rgb(var(--c-hairline) / <alpha-value>)",
        brand: {
          DEFAULT: "#10B981",
          300: "rgb(var(--c-brand-300) / <alpha-value>)",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
        },
        /* Status shades resolve per theme so label text stays legible on
           both dark and light surfaces. Mid/border shades (500/600) keep
           their default values via deep merge. */
        amber: {
          200: "rgb(var(--c-warn-weak) / <alpha-value>)",
          300: "rgb(var(--c-warn-ink) / <alpha-value>)",
          400: "rgb(var(--c-warn-soft) / <alpha-value>)",
        },
        red: {
          300: "rgb(var(--c-danger-ink) / <alpha-value>)",
          400: "rgb(var(--c-danger-ink) / <alpha-value>)",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "0.625rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(220%)" },
        },
        "beam": {
          "0%,100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 180ms ease-out both",
        sweep: "sweep 1.6s ease-in-out infinite",
        beam: "beam 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
