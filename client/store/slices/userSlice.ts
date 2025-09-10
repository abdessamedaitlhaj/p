import { StateCreator } from 'zustand';

export interface User {
  id: number; username: string; email: string; avatarurl?: string; status: string; lastSeen?: string | null; createdAt: string;
}

export interface UserSlice { user: User | null; setUser: (user: User | null) => void; }

export const createUserSlice: StateCreator<UserSlice, [], [], UserSlice> = (set, get) => ({
  user: null,
  setUser: (user) => {
    set({ user });
    // Reset join flag if present
    if ((get() as any).hasJoined) set({ ...(get() as any), hasJoined: false });
    // Defer ensureJoined until next tick (ensure slice composed)
    setTimeout(() => { 
      try { 
        console.debug('[userSlice] Post-setUser ensureJoined attempt for user', (get() as any).user?.id);
        (get() as any).ensureJoined?.(); 
      } catch (e) { console.warn('ensureJoined failed', e); } 
    }, 0);
  },
});
