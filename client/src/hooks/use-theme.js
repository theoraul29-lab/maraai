import { useState, useEffect } from "react";
const themes = {
  midnight: {
    primary: "250 89% 65%", // Electric Purple-Blue
    accent: "280 89% 65%",
    background: "230 25% 7%",
    card: "230 25% 10%",
  },
  emerald: {
    primary: "150 80% 50%", // Vibrant Green
    accent: "170 80% 50%",
    background: "150 15% 6%",
    card: "150 15% 9%",
  },
  crimson: {
    primary: "350 80% 60%", // Tech Red
    accent: "15 80% 60%",
    background: "350 15% 7%",
    card: "350 15% 10%",
  },
  amethyst: {
    primary: "270 70% 60%", // Deep Purple
    accent: "300 70% 60%",
    background: "270 20% 7%",
    card: "270 20% 10%",
  },
};
export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = localStorage.getItem("mara-theme");
    return saved || "midnight";
  });
  useEffect(() => {
    const theme = themes[currentTheme];
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--background", theme.background);
    root.style.setProperty("--card", theme.card);
    localStorage.setItem("mara-theme", currentTheme);
  }, [currentTheme]);
  return { currentTheme, setCurrentTheme, themes };
}
