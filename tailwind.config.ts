/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./frontend/public/index.html",
    "./frontend/src/**/*.{js,jsx,ts,tsx,css}",
  ],
  theme: {
    colors: {
      background: ({ opacityValue }: { opacityValue?: number }) =>
        opacityValue === undefined
          ? "hsl(var(--background))"
          : `hsl(var(--background) / ${opacityValue})`,
      primary: {
        DEFAULT: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--primary))"
            : `hsl(var(--primary) / ${opacityValue})`,
        foreground: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--primary-foreground))"
            : `hsl(var(--primary-foreground) / ${opacityValue})`,
        border: "var(--primary-border)",
      },
      "primary-foreground": ({ opacityValue }: { opacityValue?: number }) =>
        opacityValue === undefined
          ? "hsl(var(--primary-foreground))"
          : `hsl(var(--primary-foreground) / ${opacityValue})`,
      secondary: {
        DEFAULT: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--secondary))"
            : `hsl(var(--secondary) / ${opacityValue})`,
        foreground: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--secondary-foreground))"
            : `hsl(var(--secondary-foreground) / ${opacityValue})`,
        border: "var(--secondary-border)",
      },
      "secondary-foreground": ({ opacityValue }: { opacityValue?: number }) =>
        opacityValue === undefined
          ? "hsl(var(--secondary-foreground))"
          : `hsl(var(--secondary-foreground) / ${opacityValue})`,
      muted: {
        DEFAULT: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--muted))"
            : `hsl(var(--muted) / ${opacityValue})`,
        foreground: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--muted-foreground))"
            : `hsl(var(--muted-foreground) / ${opacityValue})`,
        border: "var(--muted-border)",
      },
      "muted-foreground": ({ opacityValue }: { opacityValue?: number }) =>
        opacityValue === undefined
          ? "hsl(var(--muted-foreground))"
          : `hsl(var(--muted-foreground) / ${opacityValue})`,
      accent: {
        DEFAULT: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--accent))"
            : `hsl(var(--accent) / ${opacityValue})`,
        foreground: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--accent-foreground))"
            : `hsl(var(--accent-foreground) / ${opacityValue})`,
        border: "var(--accent-border)",
      },
      "accent-foreground": ({ opacityValue }: { opacityValue?: number }) =>
        opacityValue === undefined
          ? "hsl(var(--accent-foreground))"
          : `hsl(var(--accent-foreground) / ${opacityValue})`,
      destructive: {
        DEFAULT: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--destructive))"
            : `hsl(var(--destructive) / ${opacityValue})`,
        foreground: ({ opacityValue }: { opacityValue?: number }) =>
          opacityValue === undefined
            ? "hsl(var(--destructive-foreground))"
            : `hsl(var(--destructive-foreground) / ${opacityValue})`,
        border: "var(--destructive-border)",
      },
      "destructive-foreground": ({
        opacityValue,
      }: {
        opacityValue?: number;
      }) =>
        opacityValue === undefined
          ? "hsl(var(--destructive-foreground))"
          : `hsl(var(--destructive-foreground) / ${opacityValue})`,
      chart: {
        "1": "hsl(var(--chart-1) / <alpha-value>)",
        "2": "hsl(var(--chart-2) / <alpha-value>)",
        "3": "hsl(var(--chart-3) / <alpha-value>)",
        "4": "hsl(var(--chart-4) / <alpha-value>)",
        "5": "hsl(var(--chart-5) / <alpha-value>)",
      },
      sidebar: {
        ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
        foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
        border: "hsl(var(--sidebar-border) / <alpha-value>)",
      },
      "sidebar-primary": {
        DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
        foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
        border: "var(--sidebar-primary-border)",
      },
      "sidebar-primary-foreground":
        "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
      "sidebar-accent": {
        DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
        foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
        border: "var(--sidebar-accent-border)",
      },
      "sidebar-accent-foreground":
        "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
      status: {
        online: "rgb(34 197 94)",
        away: "rgb(245 158 11)",
        busy: "rgb(239 68 68)",
        offline: "rgb(156 163 175)",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
