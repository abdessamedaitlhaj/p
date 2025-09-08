

import { useState, useEffect } from "react";
import { ThemeSelector } from "@/components/ThemeSelector";
import { GameSettingsModal } from "@/components/GameSettings";
import { pongThemes, PongTheme } from "@/lib/themes";
import { GameSettings, DEFAULT_SETTINGS } from "@/lib/gameConfig";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";

export default function HomePage() {
  const [currentTheme, setCurrentTheme] = useState<PongTheme>(pongThemes[0]);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  // Active rooms feature removed (server broadcast disabled)
  const [activeRooms, setActiveRooms] = useState<number | null>(null);
  const navigate = useNavigate();
  const socket = useStore((state) => state.socket); // Use socket from store

  useEffect(() => {
    if (!socket) return;
    
    console.log('Using store socket for lobby connection...');

  // Room count feature deprecated; no handlers registered
  const handleRoomUpdate = (_count: number) => {};
  const handleConnect = () => { console.log('Connected to server'); };

    const handleConnectError = (err: any) => {
      console.error('Connection error:', err);
    };

    // Add event listeners
    socket.on("connect", handleConnect);
  // socket.on("room_count_update", handleRoomUpdate); // removed
  // socket.on("initial_room_count", handleRoomUpdate); // removed
    socket.on("connect_error", handleConnectError);

    // Request room count if already connected
  // if (socket.connected) { socket.emit("get_room_count"); }

    return () => {
      console.log('Cleaning up socket event listeners');
      socket.off("connect", handleConnect);
  // socket.off removed events
      socket.off("connect_error", handleConnectError);
    };
  }, [socket]);

  // Debug state changes
  useEffect(() => {
    console.log("Active rooms state changed:", activeRooms);
  }, [activeRooms]);

  return (
    <div
      className="min-h-screen transition-all duration-700 ease-in-out px-4 py-8"
      style={{
        background:
          currentTheme.id === "space"
            ? `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #1a1a2e 50%, #16213e 100%)`
            : currentTheme.id === "moroccan"
              ? `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #1e40af 100%)`
              : currentTheme.id === "arcade"
                ? `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #0f172a 100%)`
                : `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #f7fafc 100%)`,
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className={`
              text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 transition-all duration-300
              ${currentTheme.fontFamily}
              ${currentTheme.glowEffect ? "animate-glow" : ""}
            `}
            style={{
              color: currentTheme.colors.text,
              textShadow: currentTheme.glowEffect
                ? `0 0 20px ${currentTheme.colors.accent}50`
                : "none",
            }}
          >
            🎮 PONG {currentTheme.centerSymbol}
          </h1>
          <p
            className={`text-lg sm:text-xl opacity-80 mb-6 ${currentTheme.fontFamily}`}
            style={{ color: currentTheme.colors.text }}
          >
            Experience the classic game with 4 unique visual themes
          </p>
        </div>

        {/* Theme Selector */}
        <ThemeSelector
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
        />

        {/* Game Controls */}
        <div className="text-center space-y-4 mt-12">
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/play", { 
                state: { 
                  theme: currentTheme,
                  settings: gameSettings 
                } 
              })}
              className={`
                px-6 py-3 rounded-lg font-semibold transition-all duration-300
                hover:scale-105 active:scale-95 ${currentTheme.fontFamily}
                ${currentTheme.glowEffect ? "hover:animate-glow" : ""}
              `}
              style={{
                backgroundColor: currentTheme.colors.paddle,
                color: currentTheme.id === "pacman" || currentTheme.id === "space"
                  ? "#000000"
                  : "#ffffff",
                boxShadow: currentTheme.glowEffect
                  ? `0 0 20px ${currentTheme.colors.paddle}40`
                  : "0 4px 6px rgba(0, 0, 0, 0.1)",
              }}
            >
              Play Game
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`
                px-6 py-3 rounded-lg font-semibold transition-all duration-300
                hover:scale-105 active:scale-95 border-2 ${currentTheme.fontFamily}
              `}
              style={{
                borderColor: currentTheme.colors.accent,
                color: currentTheme.colors.text,
                backgroundColor: "transparent",
              }}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Theme Info */}
        <div className="mt-12 text-center">
          <div
            className={`
              inline-block px-6 py-4 rounded-xl border-2 ${currentTheme.fontFamily}
            `}
            style={{
              borderColor: currentTheme.colors.accent,
              backgroundColor: `${currentTheme.colors.paddle}10`,
              color: currentTheme.colors.text,
            }}
          >
            <h3 className="font-bold text-lg mb-2">
              {currentTheme.centerSymbol} {currentTheme.name} Theme
            </h3>
            <p className="text-sm opacity-80">
              {currentTheme.id === "japanese" &&
                "Inspired by traditional Japanese aesthetics with washi paper textures and torii gate design elements."}
              {currentTheme.id === "moroccan" &&
                "Rich geometric patterns and golden accents reminiscent of Moroccan palaces and zellige tiles."}
              {currentTheme.id === "arcade" &&
                "Classic 80s arcade aesthetics with neon glows, bold stripes, and retro American styling."}
              {currentTheme.id === "space" &&
                "Futuristic space travel theme with cosmic backgrounds, glowing effects, and stellar animations."}
            </p>
          </div>
        </div>

        {/* Settings Modal */}
        <GameSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={gameSettings}
          onSettingsChange={setGameSettings}
        />
      </div>
      
  {/* Active Games Counter removed for privacy / reduced noise */}
    </div>
  );
}
// }