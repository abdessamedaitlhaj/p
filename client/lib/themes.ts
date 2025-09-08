export type PongTheme = {
  id: string;
  name: string;
  fontFamily: string;
  colors: {
    background: string;
    paddle: string;
    paddleAccent?: string;
    ball: string;
    accent: string;
    text: string;
  };
  centerSymbol: string;
  backgroundPattern?: string;
  glowEffect?: boolean;
  centerLineStyle: "dotted" | "dashed" | "solid";
  // Canvas-specific properties (eliminates duplication)
  canvas: {
    paddleShape: "rounded" | "rect";
    centerFeature: string;
    font: string;
    hasGlow: boolean;
    backgroundPattern?: string;
  };
};

export const pongThemes: PongTheme[] = [
  {
    id: "pacman",
    name: "Pacman Arcade",
    fontFamily: "font-arcade",
    colors: {
      background: "#000000",
      paddle: "#FFFF00",
      paddleAccent: "#FF0000",
      ball: "#FFFF00",
      accent: "#00FFFF",
      text: "#FFFF00",
    },
    centerSymbol: "",
    glowEffect: true,
    centerLineStyle: "dashed",
    canvas: {
      paddleShape: "rect",
      centerFeature: "",
      font: "'Orbitron', monospace",
      hasGlow: true,
      backgroundPattern: "pacman-dots",
    },
  },
  {
    id: "japanese",
    name: "Japanese Zen",
    fontFamily: "font-japanese",
    colors: {
      background: "#fffaf0",
      paddle: "#cc0000",
      ball: "#000000",
      accent: "#cc0000",
      text: "#660000",
    },
    centerSymbol: "日",
    backgroundPattern: "bg-japanese-pattern",
    centerLineStyle: "dotted",
    glowEffect: false,
    canvas: {
      paddleShape: "rounded",
      centerFeature: "日",
      font: "'Sawarabi Mincho', serif",
      hasGlow: false,
      backgroundPattern: "japanese-pattern",
    },
  },
  {
    id: "arcade",
    name: "Retro Arcade",
    fontFamily: "font-arcade",
    colors: {
      background: "#1e293b",
      paddle: "#dc2626",
      paddleAccent: "#ffffff",
      ball: "#3b82f6",
      accent: "#ffffff",
      text: "#f1f5f9",
    },
    centerSymbol: "",
    backgroundPattern: "bg-arcade-pattern",
    centerLineStyle: "dashed",
    glowEffect: true,
    canvas: {
      paddleShape: "rect",
      centerFeature: "",
      font: "'Orbitron', monospace",
      hasGlow: true,
      backgroundPattern: "arcade-grid",
    },
  },
  {
    id: "space",
    name: "Space Odyssey",
    fontFamily: "font-space",
    colors: {
      background: "#0b0c10",
      paddle: "#00ffff",
      ball: "#39ff14",
      accent: "#ffffff",
      text: "#ffffff",
    },
    centerSymbol: "",
    backgroundPattern: "bg-space-stars",
    glowEffect: true,
    centerLineStyle: "dotted",
    canvas: {
      paddleShape: "rect",
      centerFeature: "",
      font: "'Orbitron', sans-serif",
      hasGlow: true,
      backgroundPattern: "space-stars",
    },
  },
];

export const getThemeById = (id: string): PongTheme => {
  return pongThemes.find((theme) => theme.id === id) || pongThemes[0];
};
