import { useNavigate } from 'react-router-dom';
import { PongTable } from '@/components/PongTable';
import { useRemoteGame } from '@/hooks/useRemoteGame';
import { useUsers } from '@/store/useUsers';

export default function RemoteGamePage() {
  const navigate = useNavigate();
  const { theme: currentTheme, roomId, playerId, matchType, p1Name, p2Name, p1Id, p2Id, gameState, gameStarted, connectionStatus, error, exitGame } = useRemoteGame(navigate);
  const { data: users } = useUsers();
  const userMap = (users||[]).reduce<Record<string,{username:string;alias?:string|null}>>((acc,u)=>{acc[String(u.id)]={username:u.username, alias:(u as any).alias}; return acc;},{});
  const isTournament = matchType && matchType !== 'remote' && matchType !== 'matchmaking';
  const displayName = (uid?: string, fallback?: string) => {
    if (!uid) return fallback || 'Player';
    const r = userMap[uid];
    const username = r?.username || fallback || uid;
    const alias = r?.alias;
    if (isTournament) {
      if (alias) return `${alias} (#${username})`;
      return `#${username}`;
    }
    return fallback || username;
  };
  // Determine if this tab owns the game (stored when remote_room_joined originally fired)
  const isOwnerTab = (() => { try { const info = sessionStorage.getItem('remoteGameInfo'); if (!info) return false; const parsed = JSON.parse(info); return parsed?.playerId === 'p1'; } catch { return false; } })();
  const showRejoin = !!roomId && connectionStatus !== 'connected' && connectionStatus !== 'connecting' && !error && isOwnerTab;

  if (error) {
    const isDuplicateTab = error.includes('Another tab is already connected') || error.includes('Multiple tabs detected');
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-4">
          {isDuplicateTab ? 'Room Already in Use' : 'Remote Game Error'}
        </h1>
        <p className="text-xl mb-8 text-red-400 max-w-md text-center">
          {isDuplicateTab 
            ? 'This game room is already being accessed from another tab or browser. Only one connection is allowed per player.'
            : error
          }
        </p>
        <button
          onClick={() => navigate("/chat")}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Return to Chat
        </button>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-4">Connecting to Remote Game...</h1>
        <p className="text-xl mb-8">Room: {roomId}</p>
        <p className="text-lg">You are Player {playerId === 'p1' ? '1 (Left)' : '2 (Right)'}</p>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mt-8"></div>
      </div>
    );
  }

  if (connectionStatus === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-4">Connection Lost</h1>
        <p className="text-xl mb-8">Unable to connect to the game server</p>
        <button
          onClick={() => navigate("/chat")}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Return to Chat
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: currentTheme.colors.background }}
    >
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 
            className="text-4xl font-bold mb-2"
            style={{ color: currentTheme.colors.text }}
          >
            Remote Pong Game
          </h1>
          <p 
            className="text-lg"
            style={{ color: currentTheme.colors.text }}
          >
            {isTournament ? `${displayName(p1Id, p1Name)} vs ${displayName(p2Id, p2Name)}` : `${p1Name || 'Player 1'} vs ${p2Name || 'Player 2'}`} — You are Player {playerId === 'p1' ? '1 (Left Paddle)' : '2 (Right Paddle)'}
          </p>
          <p 
            className="text-sm opacity-75"
            style={{ color: currentTheme.colors.text }}
          >
            Room: {roomId}
          </p>
        </div>

        {/* Game Container */}
        <div className="rounded-lg overflow-hidden flex justify-center">
          {gameState && (
            <PongTable gameState={gameState} theme={currentTheme} />
          )}
        </div>

        {/* Status & Exit */}
        <div className="text-center mt-6">
          <div className="space-y-2">
            <p
              className="text-lg font-semibold"
              style={{ color: currentTheme.colors.text }}
            >
              {gameStarted ? 'Game In Progress!' : (connectionStatus === 'connected' ? 'Starting Game...' : 'Connecting...')}
            </p>
            <p
              className="text-sm opacity-75"
              style={{ color: currentTheme.colors.text }}
            >
              Use W/S or ↑/↓ keys to control your paddle
            </p>
          </div>
          <button
            onClick={exitGame}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors mt-4"
          >
            Exit Game
          </button>
          {showRejoin && (
            <button
              onClick={() => navigate('/remote')}
              className="ml-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors mt-4"
            >
              Rejoin
            </button>
          )}
        </div>

        {/* Game Over Screen */}
    {gameState?.gameOver && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div 
              className="p-8 rounded-lg text-center"
              style={{ backgroundColor: currentTheme.colors.background, color: currentTheme.colors.text }}
            >
              <h2 className="text-3xl font-bold mb-4">Game Over!</h2>
      <p className="text-xl mb-4">
        {gameState.endReason === 'disconnected' || gameState.endReason === 'exited'
      ? (playerId === 'p1' 
        ? (gameState.score.p1 >= gameState.settings.scoreToWin ? 'You Win! (opponent left)' : 'Opponent left, You Win!')
        : (gameState.score.p2 >= gameState.settings.scoreToWin ? 'You Win! (opponent left)' : 'Opponent left, You Win!'))
      : (gameState.score.p1 > gameState.score.p2 
        ? (playerId === 'p1' ? 'You Win!' : 'Player 1 Wins!')
        : (playerId === 'p2' ? 'You Win!' : 'Player 2 Wins!'))
        }
      </p>
              <p className="text-lg mb-6">
                Final Score: {gameState.score.p1} - {gameState.score.p2}
              </p>
              <button
                onClick={exitGame}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {matchType && matchType !== 'remote' && matchType !== 'matchmaking' ? 'Back to Tournament' : 'Return to Chat'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
