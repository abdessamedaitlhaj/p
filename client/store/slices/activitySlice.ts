import { StateCreator } from 'zustand';

export interface ActivitySlice {
  lockedUsers: Record<string, { reason: 'match'|'tournament'|'none'; inMatch: boolean }>; 
  setUserLock: (userId: string, reason: 'match'|'tournament'|'none', inMatch: boolean) => void;
  clearUserLock: (userId: string) => void;
}

export const createActivitySlice: StateCreator<ActivitySlice, [], [], ActivitySlice> = (set, get) => ({
  lockedUsers: {},
  setUserLock: (userId, reason, inMatch) => set(state => ({ lockedUsers: { ...state.lockedUsers, [userId]: { reason, inMatch } } })),
  clearUserLock: (userId) => set(state => { const next = { ...state.lockedUsers }; delete next[userId]; return { lockedUsers: next }; }),
});
