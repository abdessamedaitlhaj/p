import { pongThemes, PongTheme } from "@/lib/themes";

interface ThemeSelectorProps {
  currentTheme: PongTheme;
  onThemeChange: (theme: PongTheme) => void;
}

export function ThemeSelector({
  currentTheme,
  onThemeChange,
}: ThemeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-8 justify-center">
      {pongThemes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onThemeChange(theme)}
          className={`
            px-4 py-2 rounded-lg transition-all duration-300 text-sm font-medium
            ${
              currentTheme.id === theme.id
                ? "ring-2 ring-offset-2 ring-offset-transparent scale-105"
                : "hover:scale-105"
            }
            ${
              theme.id === "japanese"
                ? "bg-japanese-paddle text-white ring-japanese-paddle"
                : theme.id === "arcade"
                  ? "bg-arcade-paddle text-white ring-arcade-paddle"
                  : theme.id === "pacman"
                    ? "bg-pacman-paddle text-black ring-pacman-paddle"
                    : "bg-space-paddle text-black ring-space-paddle"
            }
          `}
          style={{
            backgroundColor: theme.colors.paddle,
            color:
              theme.id === "pacman" || theme.id === "space"
                ? "#000000"
                : "#ffffff",
            boxShadow:
              currentTheme.id === theme.id
                ? `0 0 20px ${theme.colors.paddle}50`
                : "none",
          }}
        >
          <span className={theme.fontFamily}>
            {theme.centerSymbol} {theme.name}
          </span>
        </button>
      ))}
    </div>
  );
}
