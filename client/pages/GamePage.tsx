import { useLocation, useNavigate } from 'react-router-dom';
import { PongTable } from '@/components/PongTable';
import { pongThemes, PongTheme } from '@/lib/themes';
import { GameSettings, DEFAULT_SETTINGS } from '@/lib/gameConfig';
import { useLocalGame } from '@/hooks/useLocalGame';
import { useGameInput } from '@/hooks/useGameInput';
import { useStore } from '@/store/useStore';

export default function GamePage() {
  const location = useLocation(); const navigate = useNavigate();
  const store = useStore();
  const { theme, settings } = (location.state as { theme: PongTheme; settings: GameSettings }) || { theme: pongThemes[0], settings: DEFAULT_SETTINGS };
  const currentTheme = theme || pongThemes[0];
  const gameSettings = settings || DEFAULT_SETTINGS;
  const { gameStarted, gameState, connectionStatus, roomId, error, startGame, retry } = useLocalGame({ theme: currentTheme, settings: gameSettings });
  useGameInput(store.socket);

  const handleStartGame = startGame;
  const handleRetry = retry;

  // Show error state
  if (connectionStatus === 'error' || error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" 
           style={{ background: `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #1a1a2e 100%)` }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4" style={{ color: currentTheme.colors.text }}>
            ❌ Connection Error
          </h1>
          <p className="mb-6" style={{ color: currentTheme.colors.text }}>
            {error || 'Failed to connect to game server'}
          </p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105"
              style={{
                backgroundColor: currentTheme.colors.paddle,
                color: currentTheme.id === "pacman" || currentTheme.id === "space" ? "#000000" : "#ffffff",
              }}
            >
              🔄 Retry Connection
            </button>
            <button
              onClick={() => navigate("/")}
              className="block mx-auto px-4 py-2 rounded border-2 transition-all duration-300 hover:scale-105"
              style={{
                borderColor: currentTheme.colors.accent,
                color: currentTheme.colors.text,
                backgroundColor: "transparent",
              }}
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (connectionStatus === 'connecting' && !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" 
           style={{ background: `linear-gradient(135deg, ${currentTheme.colors.background} 0%, #1a1a2e 100%)` }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 mx-auto mb-4"
               style={{ 
                 borderColor: `${currentTheme.colors.paddle}30`,
                 borderTopColor: currentTheme.colors.paddle 
               }}>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: currentTheme.colors.text }}>
            🎮 Connecting to Game...
          </h1>
          <p style={{ color: currentTheme.colors.text }}>
            Setting up your Pong match
          </p>
          <div className="mt-4 text-sm" style={{ color: currentTheme.colors.text }}>
            Socket: {store.socket ? '✅' : '❌'} | User: {store.user ? '✅' : '❌'} | Status: {connectionStatus} | Store Connected: {store.isConnected ? '✅' : '❌'}
          </div>
        </div>
      </div>
    );
  }

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
        {/* Header with back button */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => navigate("/")}
            className={`
              px-4 py-2 rounded-lg font-semibold transition-all duration-300
              hover:scale-105 active:scale-95 ${currentTheme.fontFamily}
            `}
            style={{
              backgroundColor: currentTheme.colors.paddle,
              color:
                currentTheme.id === "pacman" || currentTheme.id === "space"
                  ? "#000000"
                  : "#ffffff",
            }}
          >
            Back to Home
          </button>
          <h1
            className={`
              text-3xl sm:text-4xl lg:text-5xl font-bold transition-all duration-300
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
          <div className="w-24 text-right">
            {roomId && (
              <div className="text-xs opacity-70" style={{ color: currentTheme.colors.text }}>
                Room: {roomId.split('_')[1]}
              </div>
            )}
          </div>
        </div>

        {/* Connection Status */}
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
               style={{ 
                 backgroundColor: `${currentTheme.colors.paddle}20`,
                 color: currentTheme.colors.text 
               }}>
            <span className={`w-2 h-2 rounded-full ${
              (connectionStatus as 'connecting' | 'connected' | 'disconnected' | 'error') === 'connected' ? 'bg-green-500' :
              (connectionStatus as 'connecting' | 'connected' | 'disconnected' | 'error') === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              (connectionStatus as 'connecting' | 'connected' | 'disconnected' | 'error') === 'disconnected' ? 'bg-red-500' : ''
            }`}></span>
            {connectionStatus === 'connected' ? '🟢 Connected' :
             connectionStatus === 'connecting' ? '🟡 Connecting...' :
             connectionStatus === 'disconnected' ? '🔴 Disconnected' :
             '❌ Error'}
          </div>
        </div>

        {/* Pong Table */}
        <div className="mb-8 flex justify-center">
          {gameState ? (
            <PongTable 
              gameState={gameState} 
              theme={currentTheme}
              enableInterpolation={true}
            />
          ) : (
            <div className="w-80 h-60 border-2 border-dashed border-gray-400 flex items-center justify-center"
                 style={{ borderColor: currentTheme.colors.accent }}>
              <p style={{ color: currentTheme.colors.text }}>Waiting for game state...</p>
            </div>
          )}
        </div>

        {/* Game Controls */}
        {!gameStarted && (!gameState || !gameState.gameOver) && (
          <div className="text-center">
            <button
              onClick={handleStartGame}
              disabled={connectionStatus !== 'connected' || !gameState}
              className={`
                px-6 py-3 rounded-lg font-semibold transition-all duration-300
                hover:scale-105 active:scale-95 ${currentTheme.fontFamily}
                ${currentTheme.glowEffect ? "hover:animate-glow" : ""}
                ${connectionStatus !== 'connected' || !gameState ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{
                backgroundColor: currentTheme.colors.paddle,
                color:
                  currentTheme.id === "pacman" || currentTheme.id === "space"
                    ? "#000000"
                    : "#ffffff",
                boxShadow: currentTheme.glowEffect
                  ? `0 0 20px ${currentTheme.colors.paddle}40`
                  : "0 4px 6px rgba(0, 0, 0, 0.1)",
              }}
            >
              {connectionStatus === 'connected' ? (gameState ? 'Start Game' : 'Preparing...') : 'Connecting...'}
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState && gameState.gameOver && (
          <div className="text-center">
            <h2 className={`text-2xl font-bold mb-4 ${currentTheme.fontFamily}`}
                style={{ color: currentTheme.colors.text }}>
              🏆 Game Over!
            </h2>
            <p className={`text-lg mb-6 ${currentTheme.fontFamily}`}
               style={{ color: currentTheme.colors.text }}>
              {gameState.endReason === 'disconnected' || gameState.endReason === 'exited'
                ? (gameState.score.p1 > gameState.score.p2 ? 'Player 1 Wins! (opponent left)' : 'Player 2 Wins! (opponent left)')
                : (gameState.score.p1 > gameState.score.p2 ? 'Player 1 Wins!' : 'Player 2 Wins!')}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className={`
                  px-6 py-3 rounded-lg font-semibold transition-all duration-300
                  hover:scale-105 active:scale-95 ${currentTheme.fontFamily}
                `}
                style={{
                  backgroundColor: currentTheme.colors.paddle,
                  color:
                    currentTheme.id === "pacman" || currentTheme.id === "space"
                      ? "#000000"
                      : "#ffffff",
                }}
              >
                Play Again
              </button>
              <button
                onClick={() => navigate("/")}
                className={`
                  block mx-auto px-4 py-2 rounded border-2 transition-all duration-300
                  hover:scale-105 ${currentTheme.fontFamily}
                `}
                style={{
                  borderColor: currentTheme.colors.accent,
                  color: currentTheme.colors.text,
                  backgroundColor: "transparent",
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        )}

        {/* Game Status */}
        {gameStarted && !gameState.gameOver && (
          <div className="text-center">
            <p className={`text-lg ${currentTheme.fontFamily}`}
               style={{ color: currentTheme.colors.text }}>
              Game in Progress - First to {gameState.settings.scoreToWin} wins!
            </p>
          </div>
        )}

        {/* Controls Info */}
        <div
          className={`text-sm sm:text-base opacity-70 max-w-md mx-auto mt-8 text-center ${currentTheme.fontFamily}`}
          style={{ color: currentTheme.colors.text }}
        >
          <p className="mb-2">
            <strong>Player 1:</strong> W/S keys to move paddle
          </p>
          <p>
            <strong>Player 2:</strong> ↑/↓ arrow keys to move paddle
          </p>
        </div>

        {/* Debug Info (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 text-center">
            <details className="text-xs opacity-50">
              <summary style={{ color: currentTheme.colors.text }}>Debug Info</summary>
              <div className="mt-2 p-2 rounded" 
                   style={{ backgroundColor: `${currentTheme.colors.paddle}10`, color: currentTheme.colors.text }}>
                <p>Connection: {connectionStatus}</p>
                <p>Room ID: {roomId}</p>
                <p>Game Started: {gameState?.gameStarted ? 'Yes' : 'No'}</p>
                <p>Game Over: {gameState?.gameOver ? 'Yes' : 'No'}</p>
                <p>Score: {gameState ? `${gameState.score.p1} - ${gameState.score.p2}` : 'N/A'}</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}