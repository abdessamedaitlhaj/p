import { useEffect, useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { GameState } from '../../server/game/GameState';
import { GameSettings } from '@/lib/gameConfig';
import { PongTheme, pongThemes } from '@/lib/themes';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseLocalGameOptions {
  theme: PongTheme;
  settings: GameSettings;
}

export function useLocalGame({ theme, settings }: UseLocalGameOptions) {
  const { socket, user, isConnected } = useStore();
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joinedRef = useRef(false);

  // Join room & listen for events
  useEffect(() => {
    if (!socket || !user) { setConnectionStatus('disconnected'); return; }

    const settingsWithTheme = { ...settings, theme };
    const settingsString = JSON.stringify(settingsWithTheme);

    const onRoomJoined = ({ roomId }: { roomId: string }) => { 
      console.debug('[useLocalGame] room_joined', roomId); 
      setRoomId(roomId); 
      setConnectionStatus('connected'); // Set connected here when room is actually joined
    };
    const onGameState = (state: GameState) => {
      if (!gameState) console.debug('[useLocalGame] first game_state received');
      setGameState(state); if (state.gameStarted && !gameStarted) { console.debug('[useLocalGame] game started flag observed'); setGameStarted(true); } };
    const onError = (err: string) => { setError(err); setConnectionStatus('error'); };

    socket.on('room_joined', onRoomJoined);
    socket.on('game_state', onGameState);
    socket.on('error', onError);

    if (isConnected && !joinedRef.current) {
      setError(null); joinedRef.current = true;
      console.debug('[useLocalGame] emitting join_game');
      socket.emit('join_game', { settings: settingsString, userId: user.id });
    } else if (!isConnected) setConnectionStatus('connecting');

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('game_state', onGameState);
      socket.off('error', onError);
    };
  }, [socket, user, isConnected, theme, settings, gameStarted]);

  // Leave room on unmount
  useEffect(() => {
    const s = socket; const r = roomId; if (!s) return;
    const handleBeforeUnload = () => { try { s.emit('leave_game', { roomId: r || undefined }); } catch {} };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { try { s.emit('leave_game', { roomId: r || undefined }); } catch {}; window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [socket, roomId]);

  const startGame = () => {
    if (socket && connectionStatus === 'connected') { console.debug('[useLocalGame] emitting start_game'); socket.emit('start_game'); setGameStarted(true); }
    else { console.warn('[useLocalGame] startGame attempted while not connected'); setError('Cannot start game - not connected to server'); }
  };

  const retry = () => { setError(null); setConnectionStatus('connecting'); socket?.connect(); };

  return { gameStarted, gameState, connectionStatus, roomId, error, startGame, retry };
}
