import { StateCreator } from 'zustand';

export interface GameEventsSlice {
  hasJoined: boolean; onlineUsers: string[];
  setOnlineUsers: (users: string[]) => void; ensureJoined: () => void; initializeGameEvents: () => void;
}

export const createGameEventsSlice: StateCreator<GameEventsSlice, [], [], GameEventsSlice> = (set, get) => ({
  hasJoined: false,
  onlineUsers: [],
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  ensureJoined: () => {
    const state: any = get();
    if (state.socket && state.socket.connected && state.user?.id && !state.hasJoined) {
      state.socket.emit('join', state.user.id);
      set({ hasJoined: true });
    }
  },
  initializeGameEvents: () => {
    const state: any = get(); const socket = state.socket; const user = state.user; if (!socket || !user) return;
    socket.on('room_joined', ({ roomId }) => console.log('Joined local room', roomId));
    socket.on('session_replaced', () => {
      import('react-hot-toast').then(({ toast }) => toast.error('Session opened elsewhere. This tab disconnected.'));
      try { socket.disconnect(); } catch {}
      sessionStorage.clear(); localStorage.setItem('sessionReplaced', '1');
      try { window.location.href = '/'; } catch {}
    });
    const delivered = new Set<string>();
    socket.on('remote_room_joined', ({ roomId, playerId, matchType, p1Name, p2Name, p1Id, p2Id }) => {
      const key = `${roomId}:${playerId}`; if (delivered.has(key)) return; delivered.add(key);
      const gameInfo = { roomId, playerId, socketId: socket.id, matchType: matchType || 'remote', p1Name: p1Name || 'Player 1', p2Name: p2Name || 'Player 2', p1Id, p2Id, timestamp: Date.now() };
      sessionStorage.setItem('remoteGameInfo', JSON.stringify(gameInfo));
      window.dispatchEvent(new CustomEvent('navigateToRemote', { detail: gameInfo }));
    });
    socket.on('cli_navigate', (payload: { path: string }) => {
      try {
        if (payload?.path) {
          console.log('[CLI] navigation requested to', payload.path);
          window.dispatchEvent(new CustomEvent('cliNavigate', { detail: { path: payload.path } }));
        }
      } catch (e) { console.warn('cli_navigate failed', e); }
    });
    ['game_state','remote_game_state'].forEach(ev => socket.on(ev, (s: any) => { /* Game state updates */ }));
    socket.on('invite_declined', () => import('react-hot-toast').then(({ toast }) => toast.error('Invite declined')));
    socket.on('tournament_cancelled', (p: any) => {
      import('react-hot-toast').then(({ toast }) => toast.error('Tournament cancelled'));
    });
    
    // Tournament winner notification
    socket.on('tournament_winner', (p: any) => {
      console.log('🏆 Tournament winner notification received:', p);
      import('react-hot-toast').then(({ toast }) => {
        toast.success(p.message || '🏆 You won the tournament!', {
          duration: 8000,
          style: {
            background: '#10B981',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: '600',
          },
          icon: '🏆',
        });
      });
    });
    // Real-time user presence list updates
    socket.on('user_online', (users: string[]) => {
      set({ onlineUsers: users });
      // Optionally refresh selectedUser status if stored
      const sel = (get() as any).selectedUser;
      if (sel) {
        const isOnline = users.includes(String(sel.id));
        // shallow update selectedUser object with new status field
        (get() as any).setSelectedUser({ ...sel, status: isOnline ? 'online' : 'offline' });
      }
    });
    socket.on('user_offline', (users: string[]) => {
      set({ onlineUsers: users });
      const sel = (get() as any).selectedUser;
      if (sel) {
        const isOnline = users.includes(String(sel.id));
        (get() as any).setSelectedUser({ ...sel, status: isOnline ? 'online' : 'offline' });
      }
    });
    // Track per-user lock state for in-game indicator
    socket.on('user_locked', (payload: { reason: string; inMatch: boolean }) => {
      const user = (get() as any).user; if (!user) return;
      // Server emits to each user's own room; map to current user id
      const uid = String(user.id);
      (get() as any).setUserLock(uid, payload.reason === 'match' ? 'match' : payload.reason === 'tournament' ? 'tournament' : 'none', payload.inMatch);
    });
    socket.on('user_unlocked', (payload: { reason: string; inMatch: boolean }) => {
      const user = (get() as any).user; if (!user) return;
      const uid = String(user.id);
      // If unlocked, clear match lock; reason may still be tournament none
      if (!payload.inMatch) (get() as any).clearUserLock(uid);
      else (get() as any).setUserLock(uid, 'match', true);
    });
    socket.on('user_lock_state', (p: { userId: string; locked: boolean; reason: string; inMatch: boolean }) => {
      const reason = p.inMatch ? 'match' : (p.reason === 'tournament' ? 'tournament' : 'none');
      if (!p.locked) (get() as any).clearUserLock(p.userId); else (get() as any).setUserLock(p.userId, reason as any, p.inMatch);
    });
  }
});