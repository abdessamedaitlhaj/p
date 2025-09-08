import { useEffect, useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { GameState } from '../../server/game/GameState';
import { PongTheme, pongThemes, getThemeById } from '@/lib/themes';
import { ConnectionStatus } from './useLocalGame';

interface GameInfo {
  roomId?: string; playerId?: 'p1'|'p2'; matchType?: string; p1Name?: string; p2Name?: string; p1Id?: string; p2Id?: string;
}

export function useRemoteGame(navigate: (path: string, opts?: any) => void) {
  const { socket, user, isConnected } = useStore();
  const [info, setInfo] = useState<GameInfo>(() => {
    try { const stored = sessionStorage.getItem('remoteGameInfo'); if (stored) return JSON.parse(stored); } catch {}
    return {};
  });
  const { roomId, playerId, matchType, p1Name, p2Name, p1Id, p2Id } = info;
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const autoStartRef = useRef(false);

  const savedThemeId = (() => { try { return localStorage.getItem('remoteThemeId') || undefined; } catch { return undefined; } })();
  const theme = savedThemeId ? getThemeById(savedThemeId) : pongThemes[0];

  // Join remote room + listen
  useEffect(() => {
    if (!roomId || !playerId) { setError('Missing room or player information'); setTimeout(() => navigate('/chat'), 3000); return; }
    if (!socket || !user) { setConnectionStatus('disconnected'); return; }

    // Duplicate tab detection via sessionStorage
    const tabId = `tab-${Date.now()}-${Math.random()}`;
    const gameKey = `activeGame-${roomId}`;
    
    // Check if another tab is already handling this game
    const existingTab = sessionStorage.getItem(gameKey);
    if (existingTab && existingTab !== tabId) {
      setError('Game room is already in use. Please close other tabs or wait for the current session to end.');
      setConnectionStatus('error');
      return;
    }
    
    // Mark this tab as the active one for this game
    sessionStorage.setItem(gameKey, tabId);
    
    // Clean up on tab close/navigate away
    const cleanup = () => {
      const currentTab = sessionStorage.getItem(gameKey);
      if (currentTab === tabId) {
        sessionStorage.removeItem(gameKey);
      }
    };
    
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // Establish / update connection status & emit join once
    if (isConnected) {
      if (!gameState) socket.emit('join_remote_room', { roomId, playerId });
      setConnectionStatus('connected');
      setError(null);
    } else {
      setConnectionStatus('connecting');
    }

    // Handlers (must be defined BEFORE cleanup return!)
    const forceExit = () => {
      try { if (roomId) socket.emit('leave_game', { roomId }); } catch {}
    };
    const onGameState = (state: GameState) => {
      setGameState(state);
      if (state.gameStarted && !gameStarted) setGameStarted(true);
      const isTournament = matchType && matchType !== 'remote' && matchType !== 'matchmaking';
      if (isTournament && state.gameOver) {
        let stage = 'semi';
        try { stage = sessionStorage.getItem('tournamentStage') || 'semi'; } catch {}
        if (stage !== 'final') return;
        const youWon = (() => {
          const s = state.score;
          if (state.endReason === 'disconnected' || state.endReason === 'exited') {
            if (playerId === 'p1') return s.p1 >= state.settings.scoreToWin && s.p1 > s.p2;
            return s.p2 >= state.settings.scoreToWin && s.p2 > s.p1;
          }
          return playerId === 'p1' ? s.p1 > s.p2 : s.p2 > s.p1;
        })();
        sessionStorage.setItem('tournamentJustWon', youWon ? '1' : '0');
        setTimeout(() => navigate('/tournament', { state: { justWonTournament: youWon } }), 900);
      }
    };
    const onError = (err: string) => { setError(err); setConnectionStatus('error'); };
    const onSuccess = () => { setConnectionStatus('connected'); setError(null); };
    const onRoomError = (e: string) => {
      console.error('[useRemoteGame] Room error:', e);
      if (e === 'Room not found') {
        try { sessionStorage.removeItem('remoteGameInfo'); } catch {}
        setError('Game room no longer exists');
        setTimeout(() => navigate('/chat'), 2000);
      } else if (e.includes('Another tab is already connected')) {
        // Handle duplicate tab error specifically
        setError('Multiple tabs detected: ' + e);
        setConnectionStatus('error');
      } else {
        setError(e);
        setConnectionStatus('error');
      }
    };

    // Register listeners
    socket.on('tournament_force_exit_current_match', forceExit);
    socket.on('remote_game_state', onGameState);
    socket.on('error', onError);
    socket.on('remote_room_joined_success', onSuccess);
    socket.on('remote_room_error', onRoomError);

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('pagehide', cleanup);
      cleanup();
      socket.off('tournament_force_exit_current_match', forceExit);
      socket.off('remote_game_state', onGameState);
      socket.off('error', onError);
      socket.off('remote_room_joined_success', onSuccess);
      socket.off('remote_room_error', onRoomError);
    };
  }, [socket, user, isConnected, roomId, playerId, gameStarted, navigate, matchType, gameState]);

  // Input
  useEffect(() => {
    if (!socket) return;
    const down = (e: KeyboardEvent) => { const key = e.key; if (!['w','s','ArrowUp','ArrowDown'].includes(key)) return; if (['ArrowUp','ArrowDown'].includes(key)) e.preventDefault(); if (!pressedKeys.has(key)) { const next = new Set(pressedKeys); next.add(key); setPressedKeys(next); socket.emit('remote_game_input', key, true); } };
    const up = (e: KeyboardEvent) => { const key = e.key; if (!['w','s','ArrowUp','ArrowDown'].includes(key)) return; if (['ArrowUp','ArrowDown'].includes(key)) e.preventDefault(); if (pressedKeys.has(key)) { const next = new Set(pressedKeys); next.delete(key); setPressedKeys(next); socket.emit('remote_game_input', key, false); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [socket, pressedKeys]);

  // Auto start
  useEffect(() => { if (socket && connectionStatus === 'connected' && !autoStartRef.current) { console.debug('[useRemoteGame] emitting remote_start_game'); socket.emit('remote_start_game'); autoStartRef.current = true; } }, [socket, connectionStatus]);

  // Safety timeout - if game doesn't start within 30 seconds, assume room is stale
  useEffect(() => {
    if (!roomId || gameStarted) return;
    const timeout = setTimeout(() => {
      if (!gameStarted && connectionStatus !== 'error') {
        console.warn('[useRemoteGame] Game failed to start within 30 seconds, redirecting to chat');
        try { sessionStorage.removeItem('remoteGameInfo'); } catch {}
        setError('Game failed to start - room may be expired');
        setTimeout(() => navigate('/chat'), 2000);
      }
    }, 30000);
    return () => clearTimeout(timeout);
  }, [roomId, gameStarted, connectionStatus, navigate]);

  const exitGame = () => { if (socket && roomId) socket.emit('leave_game', { roomId }); navigate('/chat'); };

  return { theme, roomId, playerId, matchType, p1Name, p2Name, p1Id, p2Id, gameState, gameStarted, connectionStatus, error, exitGame };
}
