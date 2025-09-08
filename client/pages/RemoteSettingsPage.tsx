import { useEffect, useState } from "react";
import { ThemeSelector } from "@/components/ThemeSelector";
import { PongTheme, pongThemes, getThemeById } from "@/lib/themes";
import { Link } from "react-router-dom";

const REMOTE_THEME_KEY = "remoteThemeId";

export default function RemoteSettingsPage() {
  const [currentTheme, setCurrentTheme] = useState<PongTheme>(pongThemes[0]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMOTE_THEME_KEY);
      if (saved) setCurrentTheme(getThemeById(saved));
    } catch {}
  }, []);

  const handleThemeChange = (theme: PongTheme) => {
    setCurrentTheme(theme);
    try { localStorage.setItem(REMOTE_THEME_KEY, theme.id); } catch {}
  };

  return (
    <div
      className="min-h-screen transition-all duration-700 ease-in-out px-4 py-8"
      style={{
        background:
          currentTheme.id === "space"
            ? `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #1a1a2e 50%, #16213e 100%)`
            : currentTheme.id === "arcade"
              ? `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #0f172a 100%)`
              : `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #f7fafc 100%)`,
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1
            className={`text-3xl font-bold ${currentTheme.fontFamily}`}
            style={{ color: currentTheme.colors.text }}
          >
            Remote Game Theme
          </h1>
          <Link to="/chat">
            <button
              className="px-4 py-2 rounded-lg font-semibold"
              style={{
                backgroundColor: currentTheme.colors.paddle,
                color:
                  currentTheme.id === "pacman" || currentTheme.id === "space"
                    ? "#000000"
                    : "#ffffff",
              }}
            >
              Back to Chat
            </button>
          </Link>
        </div>

        <p className={`mb-4 ${currentTheme.fontFamily}`} style={{ color: currentTheme.colors.text }}>
          Choose how you see remote games (invites, matchmaking, tournaments). Your opponent can use a different theme.
        </p>

        <ThemeSelector currentTheme={currentTheme} onThemeChange={handleThemeChange} />

        <div className="mt-8 border rounded-xl overflow-hidden">
          <div
            className="p-4 text-sm"
            style={{
              backgroundColor: `${currentTheme.colors.paddle}10`,
              color: currentTheme.colors.text,
              borderColor: currentTheme.colors.accent,
            }}
          >
            Theme "{currentTheme.name}" saved for remote games.
          </div>
        </div>
      </div>
    </div>
  );
}
